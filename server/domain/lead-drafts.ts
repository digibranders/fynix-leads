import { and, eq } from "drizzle-orm";
import { extractDomainFromEmail, normaliseDomain, normaliseLinkedinUrl } from "@/lib/leads/normalize";
import { agencyLeadColumns } from "@/server/db/columns";
import type { Database } from "@/server/db/pool";
import { aliasIdentity, campaign, campaignHost, lead, leadHistory, meeting, meetingReschedule } from "@/server/db/schema";
import { withTenantScope, type ScopedTransaction } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { draftIdSchema, saveDraftSchema, submitLeadSchema, updateDraftSchema, withdrawLeadSchema } from "@/server/domain/inputs";
import { notify } from "@/server/domain/notices";
import { parseInput } from "@/server/domain/parse";
import { insertWithPublicRef } from "@/server/domain/refs";
import { checkSubmission } from "@/server/domain/leads";

/**
 * Drafts (lead flow decision, "Drafts"): an agency or coordinator saves a lead with only a campaign and a prospect name and finishes it later.
 * A draft is stored with `released = false`, so row-level security shows it to the organisation that wrote it and to Fynix, and to nobody else:
 * not the client, and not the coordinator of a partner agency. A text field that is not filled in yet is an empty string, which the table's
 * checks allow for a draft only. Saving and editing write no history row (the client reads history, and a draft is not its business); sending
 * the draft writes the first one.
 */

function requireAgency(actor: TenantActor): void {
  if (actor.orgKind !== "agency") throw new DomainError("not-authorised", "Only agency or coordinator members can write drafts.");
}

type DraftValues = ReturnType<typeof draftValues>;

/** The columns a draft input names, normalised the way a submitted lead is. Only the fields the input carries are present, so an edit changes nothing else. */
function draftValues(parsed: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  const text = (key: string) => {
    if (parsed[key] !== undefined) out[key] = parsed[key];
  };
  for (const key of ["prospectName", "prospectTitle", "prospectCompany", "prospectPhone", "prospectNotes", "bantBudget", "bantAuthority", "bantNeed", "bantTimeline", "aliasIdentityId", "hostMemberId"]) text(key);
  const email = parsed.prospectEmail;
  if (typeof email === "string") out.prospectEmail = email.trim().toLowerCase();
  if (typeof parsed.prospectDomain === "string") out.prospectDomain = parsed.prospectDomain === "" ? "" : normaliseDomain(parsed.prospectDomain);
  else if (typeof email === "string" && email !== "") out.prospectDomain = extractDomainFromEmail(email);
  if (typeof parsed.prospectLinkedinUrl === "string") out.prospectLinkedinUrl = parsed.prospectLinkedinUrl === "" ? "" : normaliseLinkedinUrl(parsed.prospectLinkedinUrl);
  if (Array.isArray(parsed.proposedTimes)) out.proposedTimes = (parsed.proposedTimes as Date[]).map((time) => time.toISOString());
  return out as Partial<{
    prospectName: string;
    prospectTitle: string;
    prospectCompany: string;
    prospectDomain: string;
    prospectLinkedinUrl: string;
    prospectEmail: string;
    prospectPhone: string;
    prospectNotes: string;
    bantBudget: string;
    bantAuthority: string;
    bantNeed: string;
    bantTimeline: string;
    aliasIdentityId: string | null;
    hostMemberId: string | null;
    proposedTimes: string[];
  }>;
}

/** The alias and the host a draft names, when it names any: both must be readable by the organisation (row-level security) and the host an active host of the campaign. */
async function checkDraftRefs(tx: ScopedTransaction, campaignId: string, values: DraftValues): Promise<void> {
  if (values.aliasIdentityId !== undefined && values.aliasIdentityId !== null) {
    const [row] = await tx.select({ id: aliasIdentity.id }).from(aliasIdentity).where(eq(aliasIdentity.id, values.aliasIdentityId)).limit(1);
    if (row === undefined) throw new DomainError("not-found", "There is no such alias identity.");
  }
  if (values.hostMemberId !== undefined && values.hostMemberId !== null) {
    const [row] = await tx
      .select({ memberId: campaignHost.memberId })
      .from(campaignHost)
      .where(and(eq(campaignHost.campaignId, campaignId), eq(campaignHost.memberId, values.hostMemberId), eq(campaignHost.active, true)))
      .limit(1);
    if (row === undefined) throw new DomainError("not-found", "The specified host is not an active host for this campaign.");
  }
}

/** Saves a new draft for a campaign the organisation serves and that is active. */
export async function saveDraft(db: Database, deps: Pick<DomainDeps, "randomBytes" | "now">, actor: TenantActor, input: unknown) {
  requireAgency(actor);
  const parsed = parseInput(saveDraftSchema, input);
  const values = draftValues(parsed);
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [campaignRow] = await tx.select({ id: campaign.id, status: campaign.status }).from(campaign).where(eq(campaign.id, parsed.campaignId)).limit(1);
    if (campaignRow === undefined) throw new DomainError("not-found", "There is no such campaign.");
    if (campaignRow.status !== "active") throw new DomainError("not-authorised", "Cannot write leads for a campaign that is not active.");
    await checkDraftRefs(tx, parsed.campaignId, values);

    const now = deps.now();
    const created = await insertWithPublicRef(tx, { prefix: "LD", constraint: "lead_public_ref_unique", randomBytes: deps.randomBytes }, async (inner, ref) => {
      const [row] = await inner
        .insert(lead)
        .values({
          publicRef: ref,
          campaignId: parsed.campaignId,
          sourceOrgId: actor.orgId,
          submittedByUserId: actor.userId,
          aliasIdentityId: values.aliasIdentityId ?? null,
          hostMemberId: values.hostMemberId ?? null,
          prospectName: values.prospectName ?? parsed.prospectName,
          prospectTitle: values.prospectTitle ?? "",
          prospectCompany: values.prospectCompany ?? "",
          prospectDomain: values.prospectDomain ?? "",
          prospectLinkedinUrl: values.prospectLinkedinUrl ?? "",
          prospectEmail: values.prospectEmail ?? "",
          prospectPhone: values.prospectPhone ?? null,
          prospectNotes: values.prospectNotes ?? null,
          bantBudget: values.bantBudget ?? "",
          bantAuthority: values.bantAuthority ?? "",
          bantNeed: values.bantNeed ?? "",
          bantTimeline: values.bantTimeline ?? "",
          stage: "draft",
          released: false,
          proposedTimes: values.proposedTimes ?? [],
          submittedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning(agencyLeadColumns);
      return row;
    });
    if (created === undefined) throw new Error("Insert of draft returned no row");
    return created;
  });
}

/** A draft of the caller's own organisation: not a lead of anyone else, and not one that has been sent. */
async function ownDraft(tx: ScopedTransaction, actor: TenantActor, leadId: string) {
  const [row] = await tx
    .select({ id: lead.id, campaignId: lead.campaignId, stage: lead.stage, sourceOrgId: lead.sourceOrgId })
    .from(lead)
    .where(and(eq(lead.id, leadId), eq(lead.sourceOrgId, actor.orgId)))
    .limit(1);
  if (row === undefined) throw new DomainError("not-found", "There is no such draft.");
  if (row.stage !== "draft") throw new DomainError("invalid-lead-stage", "Only a draft can be changed here.");
  return row;
}

/** Edits a draft. Only the fields the input carries change; the campaign never does. */
export async function updateDraft(db: Database, deps: Pick<DomainDeps, "now">, actor: TenantActor, input: unknown) {
  requireAgency(actor);
  const parsed = parseInput(updateDraftSchema, input);
  const values = draftValues(parsed);
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const draft = await ownDraft(tx, actor, parsed.leadId);
    await checkDraftRefs(tx, draft.campaignId, values);
    const [updated] = await tx
      .update(lead)
      .set({ ...values, updatedAt: deps.now() })
      .where(and(eq(lead.id, draft.id), eq(lead.stage, "draft")))
      .returning(agencyLeadColumns);
    if (updated === undefined) throw new DomainError("invalid-lead-stage", "This draft has been sent or discarded already.");
    return updated;
  });
}

/** Deletes a draft the soft way: the stage becomes `withdrawn` and `closed_at` is set. It stays unreleased, so the client never learns it existed. */
export async function discardDraft(db: Database, deps: Pick<DomainDeps, "now">, actor: TenantActor, input: unknown) {
  requireAgency(actor);
  const parsed = parseInput(draftIdSchema, input);
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const draft = await ownDraft(tx, actor, parsed.leadId);
    const now = deps.now();
    const [updated] = await tx
      .update(lead)
      .set({ stage: "withdrawn", closedAt: now, updatedAt: now })
      .where(and(eq(lead.id, draft.id), eq(lead.stage, "draft")))
      .returning(agencyLeadColumns);
    if (updated === undefined) throw new DomainError("invalid-lead-stage", "This draft has been sent or discarded already.");
    await tx.insert(leadHistory).values({ leadId: draft.id, actorUserId: actor.userId, actorRole: "agency", action: "lead.discard_draft", fromStage: "draft", toStage: "withdrawn", note: "Draft discarded", createdAt: now });
    return updated;
  });
}

/**
 * Sends a draft to the client: the full submission rules run on what the draft holds (every field, the alias, the host, the exclusion list, duplicates and
 * the share), the lead is released, the stage becomes `awaiting_client` and `submitted_at` is the moment it was sent.
 */
export async function submitDraft(db: Database, deps: Pick<DomainDeps, "now">, actor: TenantActor, input: unknown) {
  requireAgency(actor);
  const { leadId } = parseInput(draftIdSchema, input);
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [draft] = await tx
      .select({ ...agencyLeadColumns })
      .from(lead)
      .where(and(eq(lead.id, leadId), eq(lead.sourceOrgId, actor.orgId)))
      .limit(1);
    if (draft === undefined) throw new DomainError("not-found", "There is no such draft.");
    if (draft.stage !== "draft") throw new DomainError("invalid-lead-stage", "Only a draft can be sent.");

    const complete = parseInput(submitLeadSchema, {
      campaignId: draft.campaignId,
      aliasIdentityId: draft.aliasIdentityId ?? undefined,
      hostMemberId: draft.hostMemberId ?? undefined,
      prospectName: draft.prospectName,
      prospectTitle: draft.prospectTitle,
      prospectCompany: draft.prospectCompany,
      prospectDomain: draft.prospectDomain,
      prospectLinkedinUrl: draft.prospectLinkedinUrl,
      prospectEmail: draft.prospectEmail,
      prospectPhone: draft.prospectPhone ?? undefined,
      prospectNotes: draft.prospectNotes ?? undefined,
      bantBudget: draft.bantBudget,
      bantAuthority: draft.bantAuthority,
      bantNeed: draft.bantNeed,
      bantTimeline: draft.bantTimeline,
      proposedTimes: draft.proposedTimes,
    });
    const checked = await checkSubmission(tx, deps, actor, complete, draft.id);
    const now = checked.now;
    const [updated] = await tx
      .update(lead)
      .set({
        prospectDomain: checked.normalizedDomain,
        prospectLinkedinUrl: checked.normalizedLinkedin,
        prospectEmail: checked.normalizedEmail,
        stage: "awaiting_client",
        released: true,
        overShare: checked.overShare,
        submittedAt: now,
        updatedAt: now,
      })
      .where(and(eq(lead.id, draft.id), eq(lead.stage, "draft")))
      .returning(agencyLeadColumns);
    if (updated === undefined) throw new DomainError("invalid-lead-stage", "This draft has been sent or discarded already.");
    await tx.insert(leadHistory).values({
      leadId: draft.id,
      actorUserId: actor.userId,
      actorRole: "agency",
      action: "lead.submit",
      fromStage: "draft",
      toStage: "awaiting_client",
      note: "Lead submitted with proposed meeting times",
      snapshot: { publicRef: updated.publicRef, campaignId: updated.campaignId, proposedTimes: updated.proposedTimes, overShare: checked.overShare },
      createdAt: now,
    });
    await notify(tx, { type: "lead_submitted", leadId: draft.id });
    if (checked.overShare) await notify(tx, { type: "lead_over_share", leadId: draft.id });
    return updated;
  });
}

/**
 * The organisation that sent a lead withdraws it before the meeting, while it waits for the client or once a time is booked. The lead is `withdrawn` and
 * counts zero, a booked meeting is cancelled, an open proposal to move it is closed, and the history says so. The client sees it as withdrawn. The
 * coordinator of a partner agency's lead cannot withdraw it: only the source can.
 */
export async function withdrawLead(db: Database, deps: Pick<DomainDeps, "now">, actor: TenantActor, input: unknown) {
  requireAgency(actor);
  const parsed = parseInput(withdrawLeadSchema, input);
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [row] = await tx
      .select({ id: lead.id, stage: lead.stage })
      .from(lead)
      .where(and(eq(lead.id, parsed.leadId), eq(lead.sourceOrgId, actor.orgId)))
      .limit(1);
    if (row === undefined) throw new DomainError("not-found", "There is no such lead.");
    if (row.stage !== "awaiting_client" && row.stage !== "scheduled") throw new DomainError("invalid-lead-stage", "A lead can be withdrawn before its meeting only.");

    const now = deps.now();
    const note = parsed.note === undefined || parsed.note === "" ? "Withdrawn by the agency before the meeting" : parsed.note;
    const [updated] = await tx
      .update(lead)
      .set({ stage: "withdrawn", closedAt: now, updatedAt: now })
      .where(and(eq(lead.id, row.id), eq(lead.stage, row.stage)))
      .returning(agencyLeadColumns);
    if (updated === undefined) throw new DomainError("invalid-lead-stage", "This lead was changed by someone else. Refresh the page.");

    if (row.stage === "scheduled") {
      const booked = await tx.update(meeting).set({ outcome: "cancelled", updatedAt: now }).where(and(eq(meeting.leadId, row.id), eq(meeting.outcome, "scheduled"))).returning({ id: meeting.id });
      for (const entry of booked) {
        await tx.update(meetingReschedule).set({ status: "superseded", resolvedAt: now }).where(and(eq(meetingReschedule.meetingId, entry.id), eq(meetingReschedule.status, "open")));
      }
    }
    await tx.insert(leadHistory).values({
      leadId: row.id,
      actorUserId: actor.userId,
      actorRole: "agency",
      action: "lead.withdraw",
      fromStage: row.stage,
      toStage: "withdrawn",
      note,
      createdAt: now,
    });
    await notify(tx, { type: "lead_withdrawn", note, leadId: row.id });
    return updated;
  });
}
