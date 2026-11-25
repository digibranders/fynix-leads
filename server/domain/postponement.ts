import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { agencyMeetingColumns, agencyRescheduleColumns, clientMeetingColumns, clientRescheduleColumns } from "@/server/db/columns";
import type { Database } from "@/server/db/pool";
import { campaign, lead, leadHistory, meeting, meetingReschedule } from "@/server/db/schema";
import { withTenantScope, type ScopedTransaction } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { pickPostponementSchema, proposePostponementSchema } from "@/server/domain/inputs";
import { notify } from "@/server/domain/notices";
import { parseInput } from "@/server/domain/parse";

/**
 * Postponing a booked meeting (lead flow decision, "Postponing"): either side proposes one to three new times and the other side picks one, as often as
 * needed. The coordinator and the agencies are one side (`supply`). The meeting keeps its row and its link; only `scheduled_start_time` (and the lead's copy)
 * moves. A new proposal supersedes the same side's open one; picking a time closes every other open proposal of that meeting. Who on the client's side
 * proposed is never shown to the supply side: `proposed_by_user_id` has no tenant grant.
 */
export type RescheduleSide = "client" | "supply";

export interface RescheduleRecord {
  readonly id: string;
  readonly meetingId: string;
  readonly proposedBySide: string;
  readonly proposedTimes: unknown;
  readonly status: string;
  readonly pickedTime: Date | null;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
}

const sideOf = (actor: TenantActor): RescheduleSide => (actor.orgKind === "client" ? "client" : "supply");

/** The meeting of a scheduled lead that the actor's side may move: `not-found` for anyone else's, `invalid-lead-stage` once an outcome is recorded or the lead is closed. */
async function movableMeeting(tx: ScopedTransaction, actor: TenantActor, meetingId: string) {
  const [row] = await tx
    .select({ id: meeting.id, leadId: meeting.leadId, outcome: meeting.outcome, leadStage: lead.stage, // A client holds no grant on the source organisation: it is read for the supply side only.
        sourceOrgId: actor.orgKind === "client" ? sql<string | null>`null::uuid` : lead.sourceOrgId, clientOrgId: campaign.clientOrgId, coordinatorOrgId: campaign.agencyOrgId })
    .from(meeting)
    .innerJoin(lead, eq(lead.id, meeting.leadId))
    .innerJoin(campaign, eq(campaign.id, meeting.campaignId))
    .where(eq(meeting.id, meetingId))
    .limit(1);
  const mine = row !== undefined && (actor.orgKind === "client" ? row.clientOrgId === actor.orgId : row.sourceOrgId === actor.orgId || row.coordinatorOrgId === actor.orgId);
  if (row === undefined || !mine) throw new DomainError("not-found", "There is no such meeting.");
  if (row.outcome !== "scheduled" || row.leadStage !== "scheduled") throw new DomainError("invalid-lead-stage", "Only a meeting that is booked and not yet held can be moved.");
  return row;
}

/** One side offers one to three new times. They must be in the future. The same side's earlier open proposal is superseded. */
export async function proposePostponement(db: Database, deps: Pick<DomainDeps, "now">, actor: TenantActor, input: unknown): Promise<RescheduleRecord> {
  const parsed = parseInput(proposePostponementSchema, input);
  const now = deps.now();
  if (parsed.proposedTimes.some((time) => time.getTime() <= now.getTime())) throw new DomainError("invalid-input", "proposedTimes must be in the future");
  if (new Set(parsed.proposedTimes.map((time) => time.getTime())).size !== parsed.proposedTimes.length) throw new DomainError("invalid-input", "proposedTimes must not repeat a time");
  const side = sideOf(actor);
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const booked = await movableMeeting(tx, actor, parsed.meetingId);
    await tx
      .update(meetingReschedule)
      .set({ status: "superseded", resolvedAt: now })
      .where(and(eq(meetingReschedule.meetingId, booked.id), eq(meetingReschedule.proposedBySide, side), eq(meetingReschedule.status, "open")));
    const [created] = await tx
      .insert(meetingReschedule)
      .values({ meetingId: booked.id, proposedBySide: side, proposedByUserId: actor.userId, proposedTimes: parsed.proposedTimes.map((time) => time.toISOString()), status: "open", createdAt: now })
      .returning(actor.orgKind === "client" ? clientRescheduleColumns : agencyRescheduleColumns);
    if (created === undefined) throw new Error("Insert of meeting_reschedule returned no row");
    await tx.insert(leadHistory).values({
      leadId: booked.leadId,
      actorUserId: actor.userId,
      actorRole: actor.orgKind === "client" ? "client" : "agency",
      action: "meeting.postpone_propose",
      fromStage: "scheduled",
      toStage: "scheduled",
      note: "Proposed new meeting times",
      snapshot: { proposedTimes: parsed.proposedTimes.map((time) => time.toISOString()) },
      createdAt: now,
    });
    await notify(tx, { type: "postponement_proposed", by: side, leadId: booked.leadId, meetingId: booked.id });
    return created;
  });
}

/** The other side picks one of the proposed times: the meeting moves (same row, same link), the proposal is accepted and every other open one of the meeting is closed. */
export async function pickPostponement(db: Database, deps: Pick<DomainDeps, "now">, actor: TenantActor, input: unknown) {
  const parsed = parseInput(pickPostponementSchema, input);
  const side = sideOf(actor);
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [proposal] = await tx
      .select({ id: meetingReschedule.id, meetingId: meetingReschedule.meetingId, proposedBySide: meetingReschedule.proposedBySide, proposedTimes: meetingReschedule.proposedTimes, status: meetingReschedule.status })
      .from(meetingReschedule)
      .where(eq(meetingReschedule.id, parsed.rescheduleId))
      .limit(1);
    if (proposal === undefined) throw new DomainError("not-found", "There is no such proposal.");
    if (proposal.status !== "open") throw new DomainError("invalid-lead-stage", "This proposal has been answered or replaced already.");
    if (proposal.proposedBySide === side) throw new DomainError("not-authorised", "The other side picks one of the times you proposed.");
    const offered = Array.isArray(proposal.proposedTimes) ? proposal.proposedTimes.filter((entry): entry is string => typeof entry === "string") : [];
    if (!offered.some((entry) => new Date(entry).getTime() === parsed.pickedTime.getTime())) throw new DomainError("invalid-input", "pickedTime is not one of the proposed times");

    const booked = await movableMeeting(tx, actor, proposal.meetingId);
    const now = deps.now();
    const [moved] = await tx
      .update(meeting)
      .set({ scheduledStartTime: parsed.pickedTime, updatedAt: now })
      .where(and(eq(meeting.id, booked.id), eq(meeting.outcome, "scheduled")))
      .returning(actor.orgKind === "client" ? clientMeetingColumns : agencyMeetingColumns);
    if (moved === undefined) throw new DomainError("invalid-lead-stage", "This meeting was changed by someone else. Refresh the page.");
    await tx.update(lead).set({ scheduledMeetingTime: parsed.pickedTime, updatedAt: now }).where(eq(lead.id, booked.leadId));
    await tx.update(meetingReschedule).set({ status: "accepted", pickedTime: parsed.pickedTime, resolvedAt: now }).where(eq(meetingReschedule.id, proposal.id));
    await tx
      .update(meetingReschedule)
      .set({ status: "superseded", resolvedAt: now })
      .where(and(eq(meetingReschedule.meetingId, booked.id), eq(meetingReschedule.status, "open")));
    await tx.insert(leadHistory).values({
      leadId: booked.leadId,
      actorUserId: actor.userId,
      actorRole: actor.orgKind === "client" ? "client" : "agency",
      action: "meeting.postpone_pick",
      fromStage: "scheduled",
      toStage: "scheduled",
      note: "Meeting moved to a new time",
      snapshot: { pickedTime: parsed.pickedTime.toISOString() },
      createdAt: now,
    });
    await notify(tx, { type: "meeting_postponed", leadId: booked.leadId, meetingId: booked.id });
    return moved;
  });
}

/** The proposals of the given meetings that the actor's side may read, newest first. Each side sees "client" or "supply", never a person. */
export async function listReschedules(db: Database, actor: TenantActor, meetingIds: readonly string[]): Promise<readonly RescheduleRecord[]> {
  if (meetingIds.length === 0) return [];
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) =>
    tx
      .select(actor.orgKind === "client" ? clientRescheduleColumns : agencyRescheduleColumns)
      .from(meetingReschedule)
      .where(inArray(meetingReschedule.meetingId, [...meetingIds]))
      .orderBy(desc(meetingReschedule.createdAt), asc(meetingReschedule.id)),
  );
}
