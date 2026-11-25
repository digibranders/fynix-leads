import { and, asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { agencyRejectionReviewColumns } from "@/server/db/columns";
import type { Database } from "@/server/db/pool";
import { campaign, lead, leadHistory, member, organisation, rejectionReview } from "@/server/db/schema";
import { withTenantScope, type ScopedTransaction } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError, isUniqueViolation } from "@/server/domain/errors";
import { fynixRead, fynixWorkWrite, type FynixActor } from "@/server/domain/fynix-write";
import { markRejectionReviewedSchema, requestRejectionReviewSchema } from "@/server/domain/inputs";
import { notify } from "@/server/domain/notices";
import { parseInput } from "@/server/domain/parse";

/** Hours the coordinator has to ask for a review of a rejection after the client made it (lead flow decision, "Review of a rejection"). */
export const REVIEW_WINDOW_HOURS = 48;

/**
 * The coordinator presses a button on a rejected lead and types a note, inside 48 hours of the rejection. Fynix reads the request in a list. Only the
 * coordinator of the campaign may ask (a partner agency's lead goes through its coordinator), once per lead, and only for a rejection the client made after
 * the meeting. No history row is written, because the client reads the history and must not learn that the supply side asked.
 */
export async function requestRejectionReview(db: Database, deps: Pick<DomainDeps, "now">, actor: TenantActor, input: unknown) {
  if (actor.orgKind !== "agency") throw new DomainError("not-authorised", "Only the coordinator can ask for a review of a rejection.");
  const parsed = parseInput(requestRejectionReviewSchema, input);
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [row] = await tx
      .select({ id: lead.id, stage: lead.stage, decisionAt: lead.decisionAt, decisionSource: lead.decisionSource, coordinatorOrgId: campaign.agencyOrgId })
      .from(lead)
      .innerJoin(campaign, eq(campaign.id, lead.campaignId))
      .where(eq(lead.id, parsed.leadId))
      .limit(1);
    if (row === undefined) throw new DomainError("not-found", "There is no such lead.");
    if (row.coordinatorOrgId !== actor.orgId) throw new DomainError("not-authorised", "Only the coordinator of the campaign can ask for a review of a rejection.");
    if (row.stage !== "rejected" || row.decisionSource !== "client" || row.decisionAt === null) throw new DomainError("invalid-lead-stage", "A review can be asked for a rejection the client made after the meeting.");
    const now = deps.now();
    if (now.getTime() - row.decisionAt.getTime() > REVIEW_WINDOW_HOURS * 3_600_000) throw new DomainError("review-window-closed", "The 48 hours to ask for a review of this rejection are over.");
    try {
      const [created] = await tx
        .insert(rejectionReview)
        .values({ leadId: row.id, requestedByUserId: actor.userId, note: parsed.note, requestedAt: now, status: "open" })
        .returning(agencyRejectionReviewColumns);
      if (created === undefined) throw new Error("Insert of rejection_review returned no row");
      await notify(tx, { type: "review_requested", leadId: row.id });
      return created;
    } catch (error) {
      if (isUniqueViolation(error, "rejection_review_lead_unique")) throw new DomainError("already-requested", "A review of this rejection has been asked for already.");
      throw error;
    }
  });
}

/** The reviews asked for on leads the coordinator serves, newest first, so the lead screen can say "Review requested". */
export async function listMyRejectionReviews(db: Database, actor: TenantActor) {
  if (actor.orgKind !== "agency") throw new DomainError("not-authorised", "Only agency or coordinator members can read review requests.");
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => tx.select(agencyRejectionReviewColumns).from(rejectionReview).orderBy(desc(rejectionReview.requestedAt)));
}

/** One review request waiting for Fynix. */
export interface RejectionReviewRow {
  readonly reviewId: string;
  readonly leadId: string;
  readonly leadRef: string;
  readonly campaignName: string;
  readonly clientName: string;
  readonly agencyName: string;
  readonly prospectName: string;
  readonly prospectCompany: string;
  /** The client's note on the rejection. */
  readonly rejectionNote: string;
  readonly rejectedAt: Date | null;
  /** The coordinator's reason for asking. */
  readonly requestNote: string;
  readonly requestedAt: Date;
  readonly requestedByName: string | null;
  readonly status: "open" | "resolved";
  readonly resolvedAt: Date | null;
}

/** Fynix's list of review requests, oldest open first. Resolved ones are left out unless asked for. Open to staff. */
export async function listRejectionReviews(deps: DomainDeps, actor: FynixActor, options: { readonly includeResolved?: boolean } = {}): Promise<readonly RejectionReviewRow[]> {
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const clientOrg = alias(organisation, "client_org");
    const agencyOrg = alias(organisation, "agency_org");
    const rows = await tx
      .select({
        reviewId: rejectionReview.id,
        leadId: lead.id,
        leadRef: lead.publicRef,
        campaignName: campaign.name,
        clientName: clientOrg.name,
        agencyName: agencyOrg.name,
        prospectName: lead.prospectName,
        prospectCompany: lead.prospectCompany,
        rejectionNote: lead.decisionNote,
        rejectedAt: lead.decisionAt,
        requestNote: rejectionReview.note,
        requestedAt: rejectionReview.requestedAt,
        requestedByName: member.displayName,
        status: rejectionReview.status,
        resolvedAt: rejectionReview.resolvedAt,
      })
      .from(rejectionReview)
      .innerJoin(lead, eq(lead.id, rejectionReview.leadId))
      .innerJoin(campaign, eq(campaign.id, lead.campaignId))
      .innerJoin(clientOrg, eq(clientOrg.id, campaign.clientOrgId))
      .innerJoin(agencyOrg, eq(agencyOrg.id, campaign.agencyOrgId))
      .leftJoin(member, eq(member.userId, rejectionReview.requestedByUserId))
      .where(options.includeResolved === true ? undefined : eq(rejectionReview.status, "open"))
      .orderBy(asc(rejectionReview.requestedAt));
    return rows.map((row): RejectionReviewRow => ({ ...row, rejectionNote: row.rejectionNote ?? "", status: row.status === "resolved" ? "resolved" : "open" }));
  });
}

/** Closes the open review of a lead, if there is one. Called when Fynix changes the rejection or marks it reviewed. */
export async function resolveReview(tx: ScopedTransaction, leadId: string, now: Date): Promise<void> {
  await tx.update(rejectionReview).set({ status: "resolved", resolvedAt: now }).where(and(eq(rejectionReview.leadId, leadId), eq(rejectionReview.status, "open")));
}

/**
 * Fynix looked at a rejection and leaves it as it was: the lead is stamped `rejection_reviewed_at`, so it leaves the count in the navigation, and any
 * review request is resolved. Changing the rejection to accepted does the same (`fynixOverturnRejection`). Open to staff, with an audit row.
 */
export async function markRejectionReviewed(deps: DomainDeps, actor: FynixActor, leadId: string, note?: string) {
  const parsed = parseInput(markRejectionReviewedSchema, { leadId, ...(note === undefined ? {} : { note }) });
  return fynixWorkWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [row] = await tx.select({ id: lead.id, publicRef: lead.publicRef, stage: lead.stage, reviewedAt: lead.rejectionReviewedAt }).from(lead).where(eq(lead.id, parsed.leadId)).limit(1);
    if (row === undefined) throw new DomainError("not-found", "There is no such lead.");
    if (row.stage !== "rejected") throw new DomainError("invalid-lead-stage", "Only a rejected lead can be marked as reviewed.");
    const now = deps.now();
    const [updated] = await tx
      .update(lead)
      .set({ rejectionReviewedAt: now, updatedAt: now })
      .where(and(eq(lead.id, row.id), eq(lead.stage, "rejected")))
      .returning({ id: lead.id, publicRef: lead.publicRef, rejectionReviewedAt: lead.rejectionReviewedAt });
    if (updated === undefined) throw new DomainError("invalid-lead-stage", "This lead was changed by someone else. Refresh the page.");
    await resolveReview(tx, row.id, now);
    await tx.insert(leadHistory).values({ leadId: row.id, actorUserId: actor.userId, actorRole: "fynix", action: "lead.rejection_reviewed", fromStage: "rejected", toStage: "rejected", note: parsed.note ?? "Rejection reviewed by Fynix and left as it was", createdAt: now });
    await audit({ action: "lead.mark_rejection_reviewed", subject: { table: "lead", id: row.id, ref: row.publicRef }, before: { reviewed: row.reviewedAt !== null }, after: { reviewed: true } });
    return updated;
  });
}
