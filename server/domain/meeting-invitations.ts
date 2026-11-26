import { sql } from "drizzle-orm";
import { earliestBookable, freePeopleAt } from "@/lib/calendar/free-time";
import type { Database } from "@/server/db/pool";
import { eq } from "drizzle-orm";
import { lead, meeting } from "@/server/db/schema";
import { withTenantScope, type ScopedTransaction } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import { databaseRefusal } from "@/server/domain/db-refusal";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError, type DomainErrorCode } from "@/server/domain/errors";
import { fynixRead, fynixWorkWrite, type FynixActor } from "@/server/domain/fynix-write";
import { rebookMeetingSchema, replyInvitationSchema } from "@/server/domain/inputs";
import { generateInviteToken } from "@/server/domain/invite-token";
import { parseInput } from "@/server/domain/parse";
import { notify } from "@/server/domain/notices";
import { insertWithPublicRef } from "@/server/domain/refs";
import { readTeamTimeIn } from "@/server/domain/team-availability";
import { enqueueInvitationEmails } from "@/server/mail/invitation-emails";
import { createRoomSafely } from "@/server/meet/provider";

/** How long a booked meeting lasts. The campaign's own length is read from the campaign in a later step. */
const MEETING_MINUTES = 30;
const HOUR = 3_600_000;
/** Invited people must answer by this long before the meeting. */
const REPLY_DEADLINE_HOURS = 24;

export interface Invitation {
  readonly meetingId: string;
  readonly meetingRef: string;
  readonly startsAt: Date;
  readonly minutes: number;
  /** `invited` waits for an answer, `accepted` is going, `released` means someone else accepted first and this person can still accept. */
  readonly reply: "invited" | "accepted" | "released";
  readonly replyDueAt: Date | null;
  /** The meeting already has a room (it was confirmed before and has been moved), so a new Accept makes no second one. */
  readonly hasRoom: boolean;
  readonly company: string;
  readonly campaignName: string;
}

/**
 * Books a lead's meeting for one slot and invites the people of the client who are free then. Runs inside the submission's own transaction, so a refusal
 * leaves no lead behind. Every person is checked again here, under a lock, so two agencies picking the same time for the same person cannot both succeed. The
 * first person to accept confirms the meeting; each invited person gets a reply link hash, and the links themselves (the tokens) are returned for the email.
 */
/**
 * Checks, under a lock for each person, that every invited person is free for the slot and that the slot is at least 48 hours away. Two bookings for the same
 * person at once cannot both pass: the second waits for the first and then sees its hold. Returns the people without repeats.
 */
async function assertInviteesFree(tx: ScopedTransaction, input: { readonly campaignId: string; readonly slot: Date; readonly memberIds: readonly string[]; readonly now: Date }): Promise<string[]> {
  const memberIds = [...new Set(input.memberIds)];
  if (memberIds.length === 0) throw new DomainError("invalid-input", "Invite at least one person.");
  if (input.slot < earliestBookable(input.now)) throw new DomainError("invalid-input", "A meeting must be booked at least 48 hours ahead.");
  for (const id of [...memberIds].sort()) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`);
  const team = await readTeamTimeIn(tx, input.campaignId, { start: new Date(input.slot.getTime() - 24 * HOUR), end: new Date(input.slot.getTime() + 24 * HOUR) });
  const slot = { start: input.slot, end: new Date(input.slot.getTime() + MEETING_MINUTES * 60_000) };
  const free = new Set(freePeopleAt(slot, team.map((person) => ({ memberId: person.memberId, availability: person.availability, busy: person.busy })), input.now));
  if (!memberIds.every((id) => free.has(id))) throw new DomainError("invalid-input", "One of the people you invited is not free then. Pick another time or leave them out.");
  return memberIds;
}

export async function bookWithInvitations(
  tx: ScopedTransaction,
  deps: Pick<DomainDeps, "randomBytes">,
  input: { readonly leadId: string; readonly campaignId: string; readonly slot: Date; readonly memberIds: readonly string[]; readonly now: Date },
): Promise<{ readonly meetingId: string; readonly invitations: readonly { readonly memberId: string; readonly token: string }[] }> {
  const memberIds = await assertInviteesFree(tx, input);

  const booked = await insertWithPublicRef(tx, { prefix: "MTG", constraint: "meeting_public_ref_unique", randomBytes: deps.randomBytes }, async (innerTx, publicRef: string) => {
    const [row] = await innerTx
      .insert(meeting)
      .values({
        publicRef,
        leadId: input.leadId,
        campaignId: input.campaignId,
        // The person expected to take it. The one who accepts first replaces them.
        hostMemberId: memberIds[0] ?? "",
        scheduledStartTime: input.slot,
        durationMinutes: MEETING_MINUTES,
        replyDueAt: new Date(input.slot.getTime() - REPLY_DEADLINE_HOURS * HOUR),
        outcome: "scheduled",
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning({ id: meeting.id });
    return row;
  });
  if (booked === undefined) throw new Error("Insert of meeting returned no row");

  const invitations = memberIds.map((memberId) => ({ memberId, ...generateInviteToken(deps.randomBytes) }));
  await tx.execute(
    sql`select public.app_invite_attendees(${booked.id}::uuid, ${`{${invitations.map((item) => item.memberId).join(",")}}`}::uuid[], ${`{${invitations.map((item) => item.tokenHash).join(",")}}`}::text[])`,
  );
  const sent = invitations.map(({ memberId, token }) => ({ memberId, token }));
  await enqueueInvitationEmails(tx, { meetingId: booked.id, invitations: sent });
  return { meetingId: booked.id, invitations: sent };
}

const REPLY_CODES: ReadonlySet<DomainErrorCode> = new Set<DomainErrorCode>(["not-authorised", "not-found", "invalid-transition", "invalid-input", "not-a-client-member"]);
const REPLY_MESSAGES: Partial<Record<DomainErrorCode, string>> = {
  "not-authorised": "Only a person of the client can answer an invitation.",
  "not-found": "There is no such invitation for you.",
  "invalid-transition": "That invitation can no longer be answered. The deadline has passed or the meeting was moved.",
  "invalid-input": "Check your answer and try again.",
  "not-a-client-member": "Everyone invited must be an active person at the client.",
};

/** Turns a refusal raised by a database function into the plain one, and rethrows anything else untouched. */
function refused(error: unknown): never {
  const found = databaseRefusal(error, REPLY_CODES, "");
  if (found === null) throw error;
  throw new DomainError(found.code, REPLY_MESSAGES[found.code] ?? "That was refused.");
}

/** The invitations of the signed-in client person that still matter, soonest first. */
export async function listMyInvitations(db: Database, actor: TenantActor): Promise<readonly Invitation[]> {
  if (actor.orgKind !== "client") throw new DomainError("not-authorised", "Only a person of the client has invitations.");
  const rows = await withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, (tx) =>
    tx.execute<{ meeting_id: string; meeting_ref: string; starts_at: Date | string; minutes: number; reply: Invitation["reply"]; reply_due_at: Date | string | null; company: string; campaign_name: string; has_room: boolean }>(
      sql`select meeting_id, meeting_ref, starts_at, minutes, reply, reply_due_at, company, campaign_name, has_room from public.app_my_invitations()`,
    ),
  );
  return rows.rows.map((row) => ({
    meetingId: row.meeting_id,
    meetingRef: row.meeting_ref,
    startsAt: new Date(row.starts_at),
    minutes: row.minutes,
    reply: row.reply,
    replyDueAt: row.reply_due_at === null ? null : new Date(row.reply_due_at),
    hasRoom: row.has_room,
    company: row.company,
    campaignName: row.campaign_name,
  }));
}

/**
 * The signed-in client person accepts or declines an invitation. Accepting first confirms the meeting: the Meet room is made (before the transaction opens, so no
 * request to Google waits inside it; a failure leaves the link empty and never fails the answer), the lead becomes Scheduled and everyone is told. Declining
 * when nobody is left sends the lead back for a new time. Answering the same way twice changes nothing.
 */
export async function replyToInvitation(db: Database, deps: Pick<DomainDeps, "meet">, actor: TenantActor, input: unknown): Promise<{ readonly confirmed: boolean; readonly needsNewTime: boolean }> {
  if (actor.orgKind !== "client") throw new DomainError("not-authorised", "Only a person of the client can answer an invitation.");
  const parsed = parseInput(replyInvitationSchema, input);
  const waiting = parsed.reply === "accepted" ? (await listMyInvitations(db, actor)).find((item) => item.meetingId === parsed.meetingId && item.reply === "invited" && !item.hasRoom) : undefined;
  const room = waiting === undefined ? null : await createRoomSafely(deps.meet, { startsAt: waiting.startsAt, durationMinutes: waiting.minutes });
  try {
    return await withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
      const result = await tx.execute<{ confirmed_now: boolean; rescheduled: boolean; lead_id: string }>(
        sql`select confirmed_now, rescheduled, lead_id from public.app_reply_invitation(${parsed.meetingId}::uuid, ${parsed.reply}, ${room?.url ?? null}, ${room?.spaceId ?? null})`,
      );
      const row = result.rows[0];
      if (row === undefined) throw new Error("The reply returned no row");
      if (row.confirmed_now) await notify(tx, { type: "meeting_scheduled", leadId: row.lead_id, meetingId: parsed.meetingId });
      if (row.rescheduled) await notify(tx, { type: "reschedule_needed", leadId: row.lead_id, meetingId: parsed.meetingId });
      return { confirmed: row.confirmed_now, needsNewTime: row.rescheduled };
    });
  } catch (error) {
    return refused(error);
  }
}

/**
 * Lets go of every meeting nobody accepted by its deadline: the invitations are released, the lead goes back to the agency for a new time, and the agency, the
 * coordinator and Fynix are told in the app. Runs as `leads_auth` from `pnpm leads:sweep`. A second run finds nothing.
 */
export async function expireInvitations(deps: Pick<DomainDeps, "authDb">, now: Date): Promise<readonly { readonly leadId: string; readonly meetingId: string }[]> {
  const result = await deps.authDb.execute<{ lead_id: string; meeting_id: string }>(sql`select lead_id, meeting_id from public.app_expire_invitations(${now.toISOString()}::timestamptz)`);
  return result.rows.map((row) => ({ leadId: row.lead_id, meetingId: row.meeting_id }));
}

/** The part of a move that is the same for every caller: check everyone is free under their locks, then let the database function do the move and the invitations. */
async function rebookIn(tx: ScopedTransaction, deps: Pick<DomainDeps, "randomBytes">, input: { readonly leadId: string; readonly campaignId: string; readonly slot: Date; readonly memberIds: readonly string[]; readonly now: Date }) {
  const memberIds = await assertInviteesFree(tx, { campaignId: input.campaignId, slot: input.slot, memberIds: input.memberIds, now: input.now });
  const invitations = memberIds.map((memberId) => ({ memberId, ...generateInviteToken(deps.randomBytes) }));
  const due = new Date(input.slot.getTime() - REPLY_DEADLINE_HOURS * HOUR);
  const moved = await tx.execute<{ meeting_id: string }>(
    sql`select meeting_id from public.app_rebook_meeting(${input.leadId}::uuid, ${input.slot.toISOString()}::timestamptz, ${due.toISOString()}::timestamptz, ${`{${invitations.map((item) => item.memberId).join(",")}}`}::uuid[], ${`{${invitations.map((item) => item.tokenHash).join(",")}}`}::text[])`,
  );
  const meetingId = moved.rows[0]?.meeting_id;
  if (meetingId === undefined) throw new Error("The rebooking returned no meeting");
  const sent = invitations.map(({ memberId, token }) => ({ memberId, token }));
  await enqueueInvitationEmails(tx, { meetingId, invitations: sent });
  await notify(tx, { type: "meeting_invited", leadId: input.leadId, meetingId });
  await notify(tx, { type: "meeting_moved", leadId: input.leadId, meetingId });
  return { meetingId, invitations: sent };
}

/**
 * The sender of a lead, or the client of its campaign, moves the meeting to a new slot and invites the people free then. For a confirmed meeting that has not
 * started, and for one nobody could take. The meeting keeps its reference and its room, the lead goes back to Waiting for reply and the people are told. Every
 * person is checked again under a lock, like a first booking. The database function checks who is asking and the stage.
 */
export async function rebookWithInvitations(db: Database, deps: Pick<DomainDeps, "now" | "randomBytes">, actor: TenantActor, input: unknown): Promise<{ readonly meetingId: string; readonly invitations: readonly { readonly memberId: string; readonly token: string }[] }> {
  const parsed = parseInput(rebookMeetingSchema, input);
  const now = deps.now();
  try {
    return await withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
      // The database only shows a lead to the organisation that sent it or to the client it is for, so a lead of anyone else is simply not found.
      const [row] = await tx.select({ campaignId: lead.campaignId }).from(lead).where(eq(lead.id, parsed.leadId)).limit(1);
      if (row === undefined) throw new DomainError("not-found", "There is no such lead.");
      return rebookIn(tx, deps, { leadId: parsed.leadId, campaignId: row.campaignId, slot: parsed.slot, memberIds: parsed.inviteeMemberIds, now });
    });
  } catch (error) {
    if (error instanceof DomainError) throw error;
    return refused(error);
  }
}

/** Fynix moves a meeting for an agency or a client. Open to admin and staff, like the other ways Fynix steps in; the audit row names the lead and the new time. */
export async function fynixRebookMeeting(deps: Pick<DomainDeps, "fynixDb" | "now" | "randomBytes">, actor: FynixActor, input: unknown): Promise<{ readonly meetingId: string }> {
  const parsed = parseInput(rebookMeetingSchema, input);
  const now = deps.now();
  try {
    return await fynixWorkWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
      const [row] = await tx.select({ campaignId: lead.campaignId, publicRef: lead.publicRef, stage: lead.stage }).from(lead).where(eq(lead.id, parsed.leadId)).limit(1);
      if (row === undefined) throw new DomainError("not-found", "There is no such lead.");
      const moved = await rebookIn(tx, deps, { leadId: parsed.leadId, campaignId: row.campaignId, slot: parsed.slot, memberIds: parsed.inviteeMemberIds, now });
      await audit({ action: "lead.rebook", subject: { table: "lead", id: parsed.leadId, ref: row.publicRef }, before: { stage: row.stage }, after: { stage: "awaiting_reply", slot: parsed.slot.toISOString(), invited: parsed.inviteeMemberIds.length } });
      return { meetingId: moved.meetingId };
    });
  } catch (error) {
    if (error instanceof DomainError) throw error;
    return refused(error);
  }
}

/** The campaign of a lead the organisation may see, or null. Used to check the people invited live before a move opens its transaction. */
export async function campaignOfLead(db: Database, actor: TenantActor, leadId: string): Promise<string | null> {
  const [row] = await withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, (tx) => tx.select({ campaignId: lead.campaignId }).from(lead).where(eq(lead.id, leadId)).limit(1));
  return row?.campaignId ?? null;
}

/** The campaign of any lead, for Fynix, or null. */
export async function campaignOfLeadForFynix(deps: Pick<DomainDeps, "fynixDb">, actor: FynixActor, leadId: string): Promise<string | null> {
  const [row] = await fynixRead(deps.fynixDb, actor, (tx) => tx.select({ campaignId: lead.campaignId }).from(lead).where(eq(lead.id, leadId)).limit(1));
  return row?.campaignId ?? null;
}

/** Reminds each person once, a day after their invitation, that a meeting is waiting for a reply. Runs as `leads_auth` from the sweep. Returns how many were written. */
export async function remindInvitations(deps: Pick<DomainDeps, "authDb">, now: Date): Promise<number> {
  const result = await deps.authDb.execute<{ count: number }>(sql`select public.app_remind_invitations(${now.toISOString()}::timestamptz) as count`);
  return Number(result.rows[0]?.count ?? 0);
}
