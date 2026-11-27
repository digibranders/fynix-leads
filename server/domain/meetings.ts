import { and, desc, eq, or, sql } from "drizzle-orm";
import type { LeadStage } from "@/lib/leads/stage";
import { agencyMeetingColumns, clientMeetingColumns } from "@/server/db/columns";
import type { Database } from "@/server/db/pool";
import { campaign, campaignShare, lead, leadHistory, meeting, member, organisation } from "@/server/db/schema";
import { withTenantScope, type ScopedTransaction } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import { fynixWorkWrite, type FynixActor } from "@/server/domain/fynix-write";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { recordMeetingOutcomeSchema, type RecordMeetingOutcomeInput } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { notify } from "@/server/domain/notices";
import { insertWithPublicRef } from "@/server/domain/refs";
import { campaignClientName } from "@/server/db/client-name";

export interface CreateMeetingInput {
  readonly leadId: string;
  readonly campaignId: string;
  readonly hostMemberId: string;
  readonly scheduledStartTime: Date;
  readonly durationMinutes?: number;
  readonly googleMeetUrl?: string;
  readonly notes?: string;
}

/**
 * Creates and schedules a meeting for a campaign and lead.
 */
export async function scheduleMeeting(
  db: Database,
  deps: Pick<DomainDeps, "randomBytes" | "now">,
  actor: TenantActor,
  input: CreateMeetingInput,
) {
  const now = deps.now();

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const inserted = await insertWithPublicRef(
      tx,
      { prefix: "MTG", constraint: "meeting_public_ref_unique", randomBytes: deps.randomBytes },
      async (inner, publicRef: string) => {
        const [row] = await inner
          .insert(meeting)
          .values({
            publicRef,
            leadId: input.leadId,
            campaignId: input.campaignId,
            hostMemberId: input.hostMemberId,
            scheduledStartTime: input.scheduledStartTime,
            durationMinutes: input.durationMinutes ?? 30,
            googleMeetUrl: input.googleMeetUrl ?? null,
            outcome: "scheduled",
            notes: input.notes ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .returning(actor.orgKind === "client" ? clientMeetingColumns : agencyMeetingColumns);
        return row;
      },
    );

    return inserted;
  });
}

/** Which side recorded an outcome. The coordinator is the agency with no parent that serves the campaign; every other agency is an agency. */
export type OutcomeSide = "client" | "agency" | "coordinator" | "fynix";

const NEXT_STAGE = { held: "awaiting_decision", client_no_show: "client_no_show", prospect_no_show: "prospect_no_show" } as const satisfies Record<RecordMeetingOutcomeInput["outcome"], LeadStage>;

/** What an outcome does to its lead: the stage it moves to, when the outcome was set, and which of the two counted-or-closed stamps is written. One place, for a first recording and for Fynix's decision on a contest. */
export function leadPatchForOutcome(outcome: RecordMeetingOutcomeInput["outcome"], now: Date) {
  return {
    stage: NEXT_STAGE[outcome] as LeadStage,
    outcomeRecordedAt: now,
    deliveredAt: outcome === "client_no_show" ? now : null,
    closedAt: outcome === "prospect_no_show" ? now : null,
    updatedAt: now,
  };
}

/**
 * The one place an outcome is written, for every side. The first to record sets it (a second finds the meeting no longer `scheduled`):
 * - held: the lead waits for the client's accept or reject (`awaiting_decision`), and the 48 hour clock starts at `outcome_recorded_at`;
 * - client no-show: counts as one at once (`delivered_at` is the counted-at moment);
 * - prospect no-show: the lead closes and counts as zero (`closed_at`).
 * Who recorded it is kept as a side, never a name.
 */
async function applyOutcome(
  tx: ScopedTransaction,
  now: Date,
  who: { readonly userId: string; readonly side: OutcomeSide },
  parsed: RecordMeetingOutcomeInput,
) {
  const [meetingRow] = await tx
    .select({ id: meeting.id, leadId: meeting.leadId, outcome: meeting.outcome, notes: meeting.notes })
    .from(meeting)
    .where(eq(meeting.id, parsed.meetingId))
    .limit(1);
  if (meetingRow === undefined) throw new DomainError("not-found", "There is no such meeting.");

  const [leadRow] = await tx.select({ id: lead.id, stage: lead.stage }).from(lead).where(eq(lead.id, meetingRow.leadId)).limit(1);
  if (leadRow === undefined) throw new DomainError("not-found", "There is no such lead for this meeting.");

  if (meetingRow.outcome !== "scheduled") throw new DomainError("outcome-already-recorded", "The outcome of this meeting has been recorded already.");
  if (leadRow.stage !== "scheduled" && leadRow.stage !== "outcome_due") throw new DomainError("invalid-lead-stage", "An outcome can be recorded on a scheduled lead only.");

  const patch = leadPatchForOutcome(parsed.outcome, now);
  const nextStage = patch.stage;
  const [updatedMeeting] = await tx
    .update(meeting)
    .set({
      outcome: parsed.outcome,
      heldAt: parsed.outcome === "held" ? now : null,
      notes: parsed.notes !== undefined ? parsed.notes : meetingRow.notes,
      recordedAt: now,
      recordedByUserId: who.userId,
      recordedByRole: who.side,
      updatedAt: now,
    })
    // Two people can press at once: the guard on the old outcome lets only the first one through.
    .where(and(eq(meeting.id, meetingRow.id), eq(meeting.outcome, "scheduled")))
    .returning(agencyMeetingColumns);
  if (updatedMeeting === undefined) throw new DomainError("outcome-already-recorded", "The outcome of this meeting has been recorded already.");

  await tx.update(lead).set(patch).where(eq(lead.id, leadRow.id));

  await tx.insert(leadHistory).values({
    leadId: leadRow.id,
    actorUserId: who.userId,
    actorRole: who.side === "fynix" ? "fynix" : who.side === "client" ? "client" : "agency",
    action: "meeting.outcome",
    fromStage: leadRow.stage,
    toStage: nextStage,
    note: parsed.notes ?? `Meeting outcome recorded as ${parsed.outcome}`,
    snapshot: { outcome: parsed.outcome, meetingId: meetingRow.id, recordedBy: who.side },
    createdAt: now,
  });
  await notify(tx, { type: "outcome_recorded", outcome: parsed.outcome, by: who.side, leadId: leadRow.id, meetingId: meetingRow.id });

  return updatedMeeting;
}

/**
 * The client, the agency and the coordinator each record the outcome of a meeting: held, client_no_show or prospect_no_show. Fynix does it
 * through `fynixRecordMeetingOutcome`. Row-level security shows a tenant only its own meetings and leads; the side is read from the campaign.
 */
export async function recordMeetingOutcome(
  db: Database,
  deps: Pick<DomainDeps, "now">,
  actor: TenantActor,
  input: unknown,
) {
  if (actor.orgKind !== "client" && actor.orgKind !== "agency") {
    throw new DomainError("not-authorised", "Only client or agency members can record meeting outcomes.");
  }
  const parsed = parseInput(recordMeetingOutcomeSchema, input);

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    let side: OutcomeSide = "client";
    if (actor.orgKind === "agency") {
      const [row] = await tx
        .select({ sourceOrgId: lead.sourceOrgId, coordinatorOrgId: campaign.agencyOrgId })
        .from(meeting)
        .innerJoin(lead, eq(lead.id, meeting.leadId))
        .innerJoin(campaign, eq(campaign.id, meeting.campaignId))
        .where(eq(meeting.id, parsed.meetingId))
        .limit(1);
      // A lead the agency may not read leaves no row: the same answer as a meeting that does not exist.
      if (row === undefined) throw new DomainError("not-found", "There is no such meeting.");
      side = row.coordinatorOrgId === actor.orgId ? "coordinator" : "agency";
    }
    return applyOutcome(tx, deps.now(), { userId: actor.userId, side }, parsed);
  });
}

/** Fynix records an outcome too (admin or staff), with an audit row. The first to record sets it, like any other side. */
export async function fynixRecordMeetingOutcome(db: Database, deps: Pick<DomainDeps, "now">, actor: FynixActor, input: unknown) {
  const parsed = parseInput(recordMeetingOutcomeSchema, input);
  return fynixWorkWrite(db, actor, async ({ tx, audit }) => {
    const updated = await applyOutcome(tx, deps.now(), { userId: actor.userId, side: "fynix" }, parsed);
    const [leadRow] = await tx.select({ id: lead.id, publicRef: lead.publicRef, stage: lead.stage }).from(lead).where(eq(lead.id, updated.leadId)).limit(1);
    if (leadRow === undefined) throw new DomainError("not-found", "There is no such lead for this meeting.");
    await audit({
      action: "lead.record_outcome",
      subject: { table: "lead", id: leadRow.id, ref: leadRow.publicRef },
      before: { outcome: "scheduled" },
      after: { outcome: parsed.outcome, stage: leadRow.stage },
    });
    return updated;
  });
}

/** The side of the open proposal to move a meeting ("client" or "supply"), or null when none is open. Read under the caller's own row-level security. */
const openProposalSide = sql<string | null>`(select r.proposed_by_side from meeting_reschedule r where r.meeting_id = ${meeting.id} and r.status = 'open' order by r.created_at desc limit 1)`;

/**
 * Lists all meetings accessible to a client organisation.
 */
export async function listClientMeetings(db: Database, actor: TenantActor) {
  if (actor.orgKind !== "client") {
    throw new DomainError("not-authorised", "Only client members can list client meetings.");
  }

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    return tx
      .select({
        ...clientMeetingColumns,
        prospectName: lead.prospectName,
        prospectCompany: lead.prospectCompany,
        prospectEmail: lead.prospectEmail,
        leadRef: lead.publicRef,
        leadStage: lead.stage,
        campaignName: campaign.name,
        campaignRef: campaign.publicRef,
        // Until someone accepts, the person named on the meeting is only the first one invited.
        hostName: sql<string | null>`case when ${lead.stage} = 'awaiting_reply' then null else ${member.displayName} end`,
        openProposalBy: openProposalSide,
      })
      .from(meeting)
      .innerJoin(lead, eq(meeting.leadId, lead.id))
      .innerJoin(campaign, eq(meeting.campaignId, campaign.id))
      .leftJoin(member, eq(member.id, meeting.hostMemberId))
      .where(eq(campaign.clientOrgId, actor.orgId))
      .orderBy(desc(meeting.scheduledStartTime));
  });
}

/**
 * Lists all meetings accessible to an agency or coordinator organisation.
 */
export async function listAgencyMeetings(db: Database, actor: TenantActor) {
  if (actor.orgKind !== "agency") {
    throw new DomainError("not-authorised", "Only agency or coordinator members can list agency meetings.");
  }

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    return tx
      .select({
        ...agencyMeetingColumns,
        prospectName: lead.prospectName,
        prospectCompany: lead.prospectCompany,
        leadRef: lead.publicRef,
        leadStage: lead.stage,
        campaignName: campaign.name,
        campaignRef: campaign.publicRef,
        clientName: campaignClientName(campaign.id),
        openProposalBy: openProposalSide,
      })
      .from(meeting)
      .innerJoin(lead, eq(meeting.leadId, lead.id))
      .innerJoin(campaign, eq(meeting.campaignId, campaign.id))
      .where(
        or(
          eq(campaign.agencyOrgId, actor.orgId),
          eq(lead.sourceOrgId, actor.orgId),
          sql`EXISTS (SELECT 1 FROM ${campaignShare} cs WHERE cs.campaign_id = ${campaign.id} AND cs.agency_org_id = ${actor.orgId})`,
        ),
      )
      .orderBy(desc(meeting.scheduledStartTime));
  });
}

/** Every meeting on every campaign, newest first. Fynix staff read all of them; the Fynix database role has no row filter on meetings. */
export async function listFynixMeetings(db: Database, _actor: FynixActor, filter: { readonly sourceOrgId?: string } = {}) {
  return db
    .select({
      ...agencyMeetingColumns,
      prospectName: lead.prospectName,
      prospectCompany: lead.prospectCompany,
      leadRef: lead.publicRef,
      leadStage: lead.stage,
      campaignName: campaign.name,
      campaignRef: campaign.publicRef,
      clientName: campaignClientName(campaign.id),
      hostName: member.displayName,
      sourceOrgId: lead.sourceOrgId,
      sourceName: organisation.name,
      openProposalBy: openProposalSide,
    })
    .from(meeting)
    .innerJoin(lead, eq(meeting.leadId, lead.id))
    .innerJoin(organisation, eq(organisation.id, lead.sourceOrgId))
    .innerJoin(campaign, eq(meeting.campaignId, campaign.id))
    .leftJoin(member, eq(member.id, meeting.hostMemberId))
    .where(and(eq(lead.released, true), ...(filter.sourceOrgId === undefined ? [] : [eq(lead.sourceOrgId, filter.sourceOrgId)])))
    .orderBy(desc(meeting.scheduledStartTime));
}

/**
 * Retrieves the full details of a specific meeting by public reference.
 */
export async function getMeetingDetails(db: Database, actor: TenantActor, publicRef: string) {
  const cols = actor.orgKind === "client" ? clientMeetingColumns : agencyMeetingColumns;

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [row] = await tx
      .select({
        ...cols,
        prospectName: lead.prospectName,
        prospectCompany: lead.prospectCompany,
        leadRef: lead.publicRef,
        campaignName: campaign.name,
        campaignRef: campaign.publicRef,
      })
      .from(meeting)
      .innerJoin(lead, eq(meeting.leadId, lead.id))
      .innerJoin(campaign, eq(meeting.campaignId, campaign.id))
      .where(eq(meeting.publicRef, publicRef))
      .limit(1);

    if (row === undefined) {
      throw new DomainError("not-found", "There is no such meeting.");
    }

    return row;
  });
}
