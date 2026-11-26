import { sql } from "drizzle-orm";
import { earliestBookable, freePeopleAt } from "@/lib/calendar/free-time";
import type { Database } from "@/server/db/pool";
import { meeting } from "@/server/db/schema";
import { withTenantScope, type ScopedTransaction } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import { databaseRefusal } from "@/server/domain/db-refusal";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError, type DomainErrorCode } from "@/server/domain/errors";
import { replyInvitationSchema } from "@/server/domain/inputs";
import { generateInviteToken } from "@/server/domain/invite-token";
import { parseInput } from "@/server/domain/parse";
import { notify } from "@/server/domain/notices";
import { insertWithPublicRef } from "@/server/domain/refs";
import { readTeamTimeIn } from "@/server/domain/team-availability";
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
  readonly company: string;
  readonly campaignName: string;
}

/**
 * Books a lead's meeting for one slot and invites the people of the client who are free then. Runs inside the submission's own transaction, so a refusal
 * leaves no lead behind. Every person is checked again here, under a lock, so two agencies picking the same time for the same person cannot both succeed. The
 * first person to accept confirms the meeting; each invited person gets a reply link hash, and the links themselves (the tokens) are returned for the email.
 */
export async function bookWithInvitations(
  tx: ScopedTransaction,
  deps: Pick<DomainDeps, "randomBytes">,
  input: { readonly leadId: string; readonly campaignId: string; readonly slot: Date; readonly memberIds: readonly string[]; readonly now: Date },
): Promise<{ readonly meetingId: string; readonly invitations: readonly { readonly memberId: string; readonly token: string }[] }> {
  const memberIds = [...new Set(input.memberIds)];
  if (memberIds.length === 0) throw new DomainError("invalid-input", "Invite at least one person.");
  if (input.slot < earliestBookable(input.now)) throw new DomainError("invalid-input", "A meeting must be booked at least 48 hours ahead.");

  for (const id of [...memberIds].sort()) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`);
  const team = await readTeamTimeIn(tx, input.campaignId, { start: new Date(input.slot.getTime() - 24 * HOUR), end: new Date(input.slot.getTime() + 24 * HOUR) });
  const slot = { start: input.slot, end: new Date(input.slot.getTime() + MEETING_MINUTES * 60_000) };
  const free = new Set(freePeopleAt(slot, team.map((person) => ({ memberId: person.memberId, availability: person.availability, busy: person.busy })), input.now));
  if (!memberIds.every((id) => free.has(id))) throw new DomainError("invalid-input", "One of the people you invited is not free then. Pick another time or leave them out.");

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
  return { meetingId: booked.id, invitations: invitations.map(({ memberId, token }) => ({ memberId, token })) };
}

const REPLY_CODES: ReadonlySet<DomainErrorCode> = new Set<DomainErrorCode>(["not-authorised", "not-found", "invalid-transition", "invalid-input"]);
const REPLY_MESSAGES: Partial<Record<DomainErrorCode, string>> = {
  "not-authorised": "Only a person of the client can answer an invitation.",
  "not-found": "There is no such invitation for you.",
  "invalid-transition": "That invitation can no longer be answered. The deadline has passed or the meeting was moved.",
  "invalid-input": "Check your answer and try again.",
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
    tx.execute<{ meeting_id: string; meeting_ref: string; starts_at: Date | string; minutes: number; reply: Invitation["reply"]; reply_due_at: Date | string | null; company: string; campaign_name: string }>(
      sql`select meeting_id, meeting_ref, starts_at, minutes, reply, reply_due_at, company, campaign_name from public.app_my_invitations()`,
    ),
  );
  return rows.rows.map((row) => ({
    meetingId: row.meeting_id,
    meetingRef: row.meeting_ref,
    startsAt: new Date(row.starts_at),
    minutes: row.minutes,
    reply: row.reply,
    replyDueAt: row.reply_due_at === null ? null : new Date(row.reply_due_at),
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
  const waiting = parsed.reply === "accepted" ? (await listMyInvitations(db, actor)).find((item) => item.meetingId === parsed.meetingId && item.reply === "invited") : undefined;
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
