import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { agencyMeetingColumns, clientMeetingColumns } from "@/server/db/columns";
import type { Database } from "@/server/db/pool";
import { campaign, lead, leadHistory, meeting, organisation } from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixRead, fynixWorkWrite, type FynixActor } from "@/server/domain/fynix-write";
import { contestOutcomeSchema, decideContestSchema } from "@/server/domain/inputs";
import { leadPatchForOutcome } from "@/server/domain/meetings";
import { notify } from "@/server/domain/notices";
import { parseInput } from "@/server/domain/parse";

/** Hours the other side has to contest a recorded outcome (lead flow decision, "A wrong outcome"). */
export const CONTEST_WINDOW_HOURS = 48;

/** The stage a lead holds while its recorded outcome stands, by outcome: the only stages from which the outcome can be contested. */
const STAGE_OF_OUTCOME: Readonly<Record<string, string>> = { held: "awaiting_decision", client_no_show: "client_no_show", prospect_no_show: "prospect_no_show" };

/**
 * The side that did not record an outcome contests it, with a note, inside 48 hours of the recording. The client contests an outcome the coordinator or an
 * agency recorded; the coordinator or the agency contests one the client recorded. An outcome Fynix recorded cannot be contested, and neither can one the
 * client has already answered (the lead is no longer in the stage the outcome leaves it in). The meeting is flagged, the lead moves to `outcome_contested`
 * and the count it may have held (a client no-show) and any closing (a prospect no-show) are paused until Fynix decides. The automatic acceptance skips
 * the lead, because it is no longer `awaiting_decision`.
 */
export async function contestOutcome(db: Database, deps: Pick<DomainDeps, "now">, actor: TenantActor, input: unknown) {
  const parsed = parseInput(contestOutcomeSchema, input);
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [row] = await tx
      .select({
        id: meeting.id,
        leadId: meeting.leadId,
        outcome: meeting.outcome,
        recordedAt: meeting.recordedAt,
        recordedByRole: meeting.recordedByRole,
        contestedAt: meeting.contestedAt,
        leadStage: lead.stage,
        // A client holds no grant on the source organisation: it is read for the supply side only.
        sourceOrgId: actor.orgKind === "client" ? sql<string | null>`null::uuid` : lead.sourceOrgId,
        clientOrgId: campaign.clientOrgId,
        supplierOrgId: campaign.agencyOrgId,
      })
      .from(meeting)
      .innerJoin(lead, eq(lead.id, meeting.leadId))
      .innerJoin(campaign, eq(campaign.id, meeting.campaignId))
      .where(eq(meeting.id, parsed.meetingId))
      .limit(1);
    const mine = row !== undefined && (actor.orgKind === "client" ? row.clientOrgId === actor.orgId : row.sourceOrgId === actor.orgId || row.supplierOrgId === actor.orgId);
    if (row === undefined || !mine) throw new DomainError("not-found", "There is no such meeting.");
    if (row.recordedAt === null || row.recordedByRole === null) throw new DomainError("invalid-lead-stage", "No outcome has been recorded for this meeting.");
    if (row.recordedByRole === "fynix") throw new DomainError("not-authorised", "An outcome recorded by Fynix cannot be contested.");
    const recorderIsClient = row.recordedByRole === "client";
    if (recorderIsClient === (actor.orgKind === "client")) throw new DomainError("not-authorised", "Only the other side can contest an outcome.");
    if (row.contestedAt !== null) throw new DomainError("invalid-lead-stage", "This outcome has been contested already.");
    if (STAGE_OF_OUTCOME[row.outcome] !== row.leadStage) throw new DomainError("invalid-lead-stage", "This outcome can no longer be contested.");

    const now = deps.now();
    if (now.getTime() - row.recordedAt.getTime() > CONTEST_WINDOW_HOURS * 3_600_000) throw new DomainError("contest-window-closed", "The 48 hours to contest this outcome are over.");

    const role = actor.orgKind === "client" ? "client" : row.supplierOrgId === actor.orgId ? "coordinator" : "agency";
    const [updated] = await tx
      .update(meeting)
      .set({ contestedAt: now, contestNote: parsed.note, contestedByRole: role, updatedAt: now })
      .where(and(eq(meeting.id, row.id), eq(meeting.outcome, row.outcome)))
      .returning(actor.orgKind === "client" ? clientMeetingColumns : agencyMeetingColumns);
    if (updated === undefined) throw new DomainError("invalid-lead-stage", "This meeting was changed by someone else. Refresh the page.");
    await tx.update(lead).set({ stage: "outcome_contested", deliveredAt: null, closedAt: null, updatedAt: now }).where(and(eq(lead.id, row.leadId), eq(lead.stage, row.leadStage)));
    await tx.insert(leadHistory).values({
      leadId: row.leadId,
      actorUserId: actor.userId,
      actorRole: actor.orgKind === "client" ? "client" : "agency",
      action: "meeting.contest",
      fromStage: row.leadStage,
      toStage: "outcome_contested",
      note: parsed.note,
      snapshot: { outcome: row.outcome, contestedBy: role },
      createdAt: now,
    });
    await notify(tx, { type: "outcome_contested", by: role, note: parsed.note, leadId: row.leadId, meetingId: row.id });
    return updated;
  });
}

/** One contested outcome waiting for Fynix. */
export interface ContestRow {
  readonly leadId: string;
  readonly leadRef: string;
  readonly meetingId: string;
  readonly campaignName: string;
  readonly clientName: string;
  readonly agencyName: string;
  readonly prospectName: string;
  readonly prospectCompany: string;
  /** The outcome as first recorded, which is the one in dispute. */
  readonly outcome: string;
  readonly recordedByRole: string | null;
  readonly recordedAt: Date | null;
  readonly contestedByRole: string | null;
  readonly contestNote: string;
  readonly contestedAt: Date;
  readonly meetingNotes: string | null;
}

/** Every contested outcome, oldest contest first: Fynix's queue. Open to staff. */
export async function listContests(deps: DomainDeps, actor: FynixActor): Promise<readonly ContestRow[]> {
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const clientOrg = alias(organisation, "client_org");
    const agencyOrg = alias(organisation, "agency_org");
    const rows = await tx
      .select({
        leadId: lead.id,
        leadRef: lead.publicRef,
        meetingId: meeting.id,
        campaignName: campaign.name,
        clientName: clientOrg.name,
        agencyName: agencyOrg.name,
        prospectName: lead.prospectName,
        prospectCompany: lead.prospectCompany,
        outcome: meeting.outcome,
        recordedByRole: meeting.recordedByRole,
        recordedAt: meeting.recordedAt,
        contestedByRole: meeting.contestedByRole,
        contestNote: meeting.contestNote,
        contestedAt: meeting.contestedAt,
        meetingNotes: meeting.notes,
      })
      .from(lead)
      .innerJoin(meeting, eq(meeting.leadId, lead.id))
      .innerJoin(campaign, eq(campaign.id, lead.campaignId))
      .innerJoin(clientOrg, eq(clientOrg.id, campaign.clientOrgId))
      .innerJoin(agencyOrg, eq(agencyOrg.id, lead.sourceOrgId))
      .where(eq(lead.stage, "outcome_contested"))
      .orderBy(asc(meeting.contestedAt), desc(lead.updatedAt));
    return rows.flatMap((row) => (row.contestedAt === null ? [] : [{ ...row, contestedAt: row.contestedAt, contestNote: row.contestNote ?? "" }]));
  });
}

/**
 * Fynix decides a contest: the outcome it names is final, recorded as Fynix's, and the lead carries on the normal way. Held sends it to the client for
 * an answer with the 48 hours starting now; a client no-show counts one; a prospect no-show closes it at zero. Open to staff, with an audit row.
 */
export async function fynixDecideContest(deps: DomainDeps, actor: FynixActor, leadId: string, outcome: "held" | "client_no_show" | "prospect_no_show", note: string) {
  const parsed = parseInput(decideContestSchema, { leadId, outcome, note });
  return fynixWorkWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [row] = await tx
      .select({ id: lead.id, publicRef: lead.publicRef, stage: lead.stage, meetingId: meeting.id, meetingOutcome: meeting.outcome })
      .from(lead)
      .innerJoin(meeting, eq(meeting.leadId, lead.id))
      .where(eq(lead.id, parsed.leadId))
      .orderBy(desc(meeting.createdAt))
      .limit(1);
    if (row === undefined) throw new DomainError("not-found", "There is no such lead.");
    if (row.stage !== "outcome_contested") throw new DomainError("invalid-lead-stage", "Only a lead whose outcome is contested can be decided.");

    const now = deps.now();
    const patch = leadPatchForOutcome(parsed.outcome, now);
    await tx
      .update(meeting)
      .set({ outcome: parsed.outcome, heldAt: parsed.outcome === "held" ? now : null, recordedByRole: "fynix", recordedByUserId: actor.userId, recordedAt: now, updatedAt: now })
      .where(eq(meeting.id, row.meetingId));
    const [updated] = await tx.update(lead).set(patch).where(and(eq(lead.id, row.id), eq(lead.stage, "outcome_contested"))).returning({ id: lead.id, publicRef: lead.publicRef, stage: lead.stage });
    if (updated === undefined) throw new DomainError("invalid-lead-stage", "This lead was changed by someone else. Refresh the page.");
    await tx.insert(leadHistory).values({
      leadId: row.id,
      actorUserId: actor.userId,
      actorRole: "fynix",
      action: "meeting.contest_decided",
      fromStage: "outcome_contested",
      toStage: patch.stage,
      note: parsed.note,
      snapshot: { outcome: parsed.outcome, contestedOutcome: row.meetingOutcome },
      createdAt: now,
    });
    await notify(tx, { type: "contest_decided", outcome: parsed.outcome, note: parsed.note, leadId: row.id, meetingId: row.meetingId });
    await audit({
      action: "lead.decide_contest",
      subject: { table: "lead", id: row.id, ref: row.publicRef },
      before: { stage: "outcome_contested", outcome: row.meetingOutcome },
      after: { stage: patch.stage, outcome: parsed.outcome },
    });
    return updated;
  });
}
