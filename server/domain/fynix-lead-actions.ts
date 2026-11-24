import { and, eq, inArray } from "drizzle-orm";
import { extractDomainFromEmail, normaliseDomain, normaliseLinkedinUrl } from "@/lib/leads/normalize";
import { lead, leadHistory, meeting, meetingReschedule } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixWorkWrite, type FynixActor } from "@/server/domain/fynix-write";
import { answerForClientSchema, approveOverShareSchema, correctLeadSchema, markLostSchema } from "@/server/domain/inputs";
import { bookMeeting } from "@/server/domain/leads";
import { createRoomSafely } from "@/server/meet/provider";
import { notify } from "@/server/domain/notices";
import { parseInput } from "@/server/domain/parse";

/**
 * Fynix acts on a lead (lead flow decision, "Fynix check": a lead goes straight to the client, and Fynix sees every lead and can step in). Each action is open to
 * admin and staff, needs a note, writes a history row in Fynix's name and an audit row. The history row names Fynix as the side; the client and the supply side
 * read it as "Fynix", never a person. Where Fynix answers for the client the decision is recorded with the source `fynix`.
 */

async function loadLead(tx: ScopedTransaction, leadId: string) {
  const [row] = await tx
    .select({ id: lead.id, publicRef: lead.publicRef, campaignId: lead.campaignId, hostMemberId: lead.hostMemberId, stage: lead.stage, proposedTimes: lead.proposedTimes, overShare: lead.overShare })
    .from(lead)
    .where(eq(lead.id, leadId))
    .limit(1);
  if (row === undefined) throw new DomainError("not-found", "There is no such lead.");
  if (row.stage === "draft") throw new DomainError("invalid-lead-stage", "A draft belongs to its agency until it is sent.");
  return row;
}

/** A booked meeting that will not happen: cancelled, with any open proposal to move it closed. */
async function cancelBooking(tx: ScopedTransaction, leadId: string, now: Date): Promise<void> {
  const booked = await tx.update(meeting).set({ outcome: "cancelled", updatedAt: now }).where(and(eq(meeting.leadId, leadId), eq(meeting.outcome, "scheduled"))).returning({ id: meeting.id });
  if (booked.length > 0) {
    await tx
      .update(meetingReschedule)
      .set({ status: "superseded", resolvedAt: now })
      .where(and(inArray(meetingReschedule.meetingId, booked.map((entry) => entry.id)), eq(meetingReschedule.status, "open")));
  }
}

/** Fynix corrects what the lead says about the prospect and its qualification. Only the fields named change; the history and the audit row name the fields, never the values. */
export async function fynixCorrectLead(deps: DomainDeps, actor: FynixActor, input: unknown) {
  const parsed = parseInput(correctLeadSchema, input);
  return fynixWorkWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const row = await loadLead(tx, parsed.leadId);
    const { note } = parsed;
    const changes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) if (key !== "leadId" && key !== "note" && value !== undefined) changes[key] = value;
    if (typeof changes.prospectEmail === "string" && changes.prospectDomain === undefined) changes.prospectDomain = extractDomainFromEmail(changes.prospectEmail);
    if (typeof changes.prospectDomain === "string") changes.prospectDomain = normaliseDomain(changes.prospectDomain);
    if (typeof changes.prospectLinkedinUrl === "string") changes.prospectLinkedinUrl = normaliseLinkedinUrl(changes.prospectLinkedinUrl);
    const now = deps.now();
    const [updated] = await tx.update(lead).set({ ...changes, updatedAt: now }).where(eq(lead.id, row.id)).returning({ id: lead.id, publicRef: lead.publicRef, stage: lead.stage, updatedAt: lead.updatedAt });
    if (updated === undefined) throw new DomainError("not-found", "There is no such lead.");
    const names = Object.keys(changes);
    await tx.insert(leadHistory).values({ leadId: row.id, actorUserId: actor.userId, actorRole: "fynix", action: "lead.correct", fromStage: row.stage, toStage: row.stage, note, snapshot: { fields: names }, createdAt: now });
    await audit({ action: "lead.correct", subject: { table: "lead", id: row.id, ref: row.publicRef }, before: { stage: row.stage }, after: { stage: row.stage, fields: names } });
    return updated;
  });
}

/**
 * Fynix answers for the client, with a note, when the client cannot or will not: it picks one of the proposed times (the meeting is booked), rejects before the
 * meeting (the lead closes at zero), or accepts or rejects after it. The decision source is `fynix`.
 */
export async function fynixAnswerForClient(deps: DomainDeps, actor: FynixActor, input: unknown) {
  const parsed = parseInput(answerForClientSchema, input);
  // The room is made before the transaction opens, like the client's booking (see bookMeeting). Fynix's own pick of a time is the only answer that books.
  const room = parsed.answer === "pick_time" && parsed.selectedMeetingTime !== undefined ? await createRoomSafely(deps.meet, { startsAt: new Date(parsed.selectedMeetingTime), durationMinutes: 30 }) : null;
  return fynixWorkWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const row = await loadLead(tx, parsed.leadId);
    const now = deps.now();
    const bookable = row.stage === "awaiting_client";
    const before = row.stage === "awaiting_client" || row.stage === "scheduled";
    const decided = { decisionNote: parsed.note, decisionAt: now, decisionByUserId: actor.userId, decisionSource: "fynix", updatedAt: now } as const;
    let nextStage: string;
    let meetingId: string | undefined;

    if (parsed.answer === "pick_time") {
      if (!bookable) throw new DomainError("invalid-lead-stage", "Only a lead that waits for a time can have one picked.");
      const time = parsed.selectedMeetingTime;
      const offered = Array.isArray(row.proposedTimes) ? row.proposedTimes.filter((entry): entry is string => typeof entry === "string") : [];
      if (time === undefined || !offered.some((entry) => new Date(entry).getTime() === time.getTime())) throw new DomainError("invalid-input", "selectedMeetingTime is not one of the proposed times");
      nextStage = "scheduled";
      await tx.update(lead).set({ stage: "scheduled", scheduledMeetingTime: time, scheduledAt: now, updatedAt: now }).where(and(eq(lead.id, row.id), eq(lead.stage, "awaiting_client")));
      meetingId = await bookMeeting(tx, deps.randomBytes, row, time, now, room);
    } else if (parsed.answer === "reject_before") {
      if (!before) throw new DomainError("invalid-lead-stage", "A lead can be rejected before its meeting only.");
      nextStage = "declined";
      await tx.update(lead).set({ ...decided, stage: "declined", declineReason: parsed.note, closedAt: now }).where(and(eq(lead.id, row.id), eq(lead.stage, row.stage)));
      if (row.stage === "scheduled") await cancelBooking(tx, row.id, now);
    } else {
      if (row.stage !== "awaiting_decision") throw new DomainError("invalid-lead-stage", "Only a lead whose meeting has been held can be accepted or rejected.");
      const accepted = parsed.answer === "accept";
      nextStage = accepted ? "accepted" : "rejected";
      await tx.update(lead).set({ ...decided, stage: nextStage, deliveredAt: accepted ? now : null, closedAt: accepted ? null : now }).where(and(eq(lead.id, row.id), eq(lead.stage, "awaiting_decision")));
    }

    await tx.insert(leadHistory).values({ leadId: row.id, actorUserId: actor.userId, actorRole: "fynix", action: "lead.answer_for_client", fromStage: row.stage, toStage: nextStage, note: parsed.note, snapshot: { answer: parsed.answer }, createdAt: now });
    if (parsed.answer === "pick_time") await notify(tx, { type: "meeting_scheduled", leadId: row.id, meetingId });
    else if (parsed.answer === "reject_before") await notify(tx, { type: "rejected_before_meeting", by: "fynix", note: parsed.note, leadId: row.id });
    else await notify(tx, { type: parsed.answer === "accept" ? "lead_accepted" : "lead_rejected", by: "fynix", note: parsed.note, leadId: row.id });
    await audit({ action: "lead.answer_for_client", subject: { table: "lead", id: row.id, ref: row.publicRef }, before: { stage: row.stage }, after: { stage: nextStage, answer: parsed.answer, decisionSource: "fynix" } });
    return { id: row.id, publicRef: row.publicRef, stage: nextStage };
  });
}

/** The stages a lead can be lost from: it is still open and has not been counted. */
const LOSABLE = ["awaiting_client", "scheduled", "outcome_due", "reschedule_needed", "held", "awaiting_decision", "outcome_contested"] as const;

/** Fynix marks a lead lost: it closes, counts zero, and a booked meeting is cancelled. */
export async function fynixMarkLost(deps: DomainDeps, actor: FynixActor, input: unknown) {
  const parsed = parseInput(markLostSchema, input);
  return fynixWorkWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const row = await loadLead(tx, parsed.leadId);
    if (!(LOSABLE as readonly string[]).includes(row.stage)) throw new DomainError("invalid-lead-stage", "Only a lead that is still open can be marked lost.");
    const now = deps.now();
    const [updated] = await tx
      .update(lead)
      .set({ stage: "lost", closedAt: now, deliveredAt: null, updatedAt: now })
      .where(and(eq(lead.id, row.id), eq(lead.stage, row.stage)))
      .returning({ id: lead.id, publicRef: lead.publicRef, stage: lead.stage });
    if (updated === undefined) throw new DomainError("invalid-lead-stage", "This lead was changed by someone else. Refresh the page.");
    await cancelBooking(tx, row.id, now);
    await tx.insert(leadHistory).values({ leadId: row.id, actorUserId: actor.userId, actorRole: "fynix", action: "lead.mark_lost", fromStage: row.stage, toStage: "lost", note: parsed.note, createdAt: now });
    await notify(tx, { type: "lead_lost", note: parsed.note, leadId: row.id });
    await audit({ action: "lead.mark_lost", subject: { table: "lead", id: row.id, ref: row.publicRef }, before: { stage: row.stage }, after: { stage: "lost" } });
    return updated;
  });
}

/**
 * Fynix decides a lead that went beyond a share (spec D17). `over_share` is only a flag: it never blocks a submission or a count, so approving clears the flag,
 * which counts the lead like any other against the campaign. Not approving leaves it flagged; to refuse it Fynix marks the lead lost.
 */
export async function fynixApproveOverShare(deps: DomainDeps, actor: FynixActor, input: unknown) {
  const parsed = parseInput(approveOverShareSchema, input);
  return fynixWorkWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const row = await loadLead(tx, parsed.leadId);
    if (!row.overShare) throw new DomainError("invalid-input", "leadId is not a lead beyond a share");
    const now = deps.now();
    const [updated] = await tx.update(lead).set({ overShare: false, updatedAt: now }).where(and(eq(lead.id, row.id), eq(lead.overShare, true))).returning({ id: lead.id, publicRef: lead.publicRef, overShare: lead.overShare });
    if (updated === undefined) throw new DomainError("invalid-lead-stage", "This lead was changed by someone else. Refresh the page.");
    await tx.insert(leadHistory).values({ leadId: row.id, actorUserId: actor.userId, actorRole: "fynix", action: "lead.approve_over_share", fromStage: row.stage, toStage: row.stage, note: parsed.note, createdAt: now });
    await audit({ action: "lead.approve_over_share", subject: { table: "lead", id: row.id, ref: row.publicRef }, before: { overShare: true }, after: { overShare: false } });
    return updated;
  });
}
