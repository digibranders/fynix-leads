import { sql } from "drizzle-orm";
import { invitationLinkChecks } from "@/lib/auth/rate-limit-rules";
import { firstBlockedLimit } from "@/server/auth/rate-limit";
import type { DomainDeps } from "@/server/domain/deps";
import { databaseRefusal } from "@/server/domain/db-refusal";
import { DomainError } from "@/server/domain/errors";
import { hashInviteToken, isWellFormedInviteToken } from "@/server/domain/invite-token";
import { enqueueLeadEmails } from "@/server/mail/lead-emails";
import { createRoomSafely } from "@/server/meet/provider";

/**
 * The reply page of an invitation email: a person of a client opens the link in their email, with no sign-in, and accepts or declines the meeting. The link holds a
 * 32 byte token of which only the SHA-256 is stored, so this runs as `leads_auth` through database functions that are handed the hash. An unknown token, a closed
 * meeting and a missed deadline are told apart only after the token is known to be real, so the page leaks nothing to someone guessing.
 */
export interface InvitationDetails {
  readonly meetingRef: string;
  readonly company: string;
  readonly campaignName: string;
  readonly startsAt: Date;
  readonly minutes: number;
  readonly timeZone: string;
  readonly replyDueAt: Date | null;
  readonly personName: string;
  /** `invited` has not answered, `accepted` is going, `declined` said no, `released` means someone else accepted first and they can still accept. */
  readonly reply: "invited" | "accepted" | "declined" | "released";
  readonly confirmed: boolean;
  readonly hasRoom: boolean;
}

export type InvitationLinkView =
  | { readonly status: "open"; readonly details: InvitationDetails }
  | { readonly status: "expired"; readonly details: InvitationDetails }
  | { readonly status: "closed" }
  | { readonly status: "invalid" }
  | { readonly status: "rate-limited"; readonly retryAfterSeconds: number };

type Row = {
  meeting_id: string;
  meeting_ref: string;
  company: string;
  campaign_name: string;
  starts_at: Date | string;
  minutes: number;
  reply: InvitationDetails["reply"];
  reply_due_at: Date | string | null;
  confirmed: boolean;
  outcome: string;
  time_zone: string;
  has_room: boolean;
  person_name: string;
};

async function read(deps: DomainDeps, token: string): Promise<{ readonly row: Row; readonly view: Exclude<InvitationLinkView, { status: "invalid" | "rate-limited" }> } | null> {
  if (!isWellFormedInviteToken(token)) return null;
  const found = await deps.authDb.execute<Row>(
    sql`select meeting_id, meeting_ref, company, campaign_name, starts_at, minutes, reply, reply_due_at, confirmed, outcome, time_zone, has_room, person_name from public.app_invitation_by_token(${hashInviteToken(token)})`,
  );
  const row = found.rows[0];
  if (row === undefined) return null;
  const details: InvitationDetails = {
    meetingRef: row.meeting_ref,
    company: row.company,
    campaignName: row.campaign_name,
    startsAt: new Date(row.starts_at),
    minutes: row.minutes,
    timeZone: row.time_zone,
    replyDueAt: row.reply_due_at === null ? null : new Date(row.reply_due_at),
    personName: row.person_name,
    reply: row.reply,
    confirmed: row.confirmed,
    hasRoom: row.has_room,
  };
  if (row.outcome !== "scheduled" || details.startsAt <= deps.now()) return { row, view: { status: "closed" } };
  const lapsed = row.reply === "invited" && !row.confirmed && details.replyDueAt !== null && details.replyDueAt <= deps.now();
  return { row, view: { status: lapsed ? "expired" : "open", details } };
}

/** What the page shows for a link. */
export async function previewInvitationLink(deps: DomainDeps, input: { readonly token: string; readonly address: string }): Promise<InvitationLinkView> {
  const blocked = await firstBlockedLimit(deps.publicDb, invitationLinkChecks(input.address, false), deps.now());
  if (blocked !== null) return { status: "rate-limited", retryAfterSeconds: blocked.retryAfterSeconds };
  return (await read(deps, input.token))?.view ?? { status: "invalid" };
}

export type InvitationAnswer =
  | { readonly status: "done"; readonly reply: "accepted" | "declined"; readonly confirmed: boolean; readonly needsNewTime: boolean }
  | { readonly status: "expired" | "closed" | "invalid" }
  | { readonly status: "rate-limited"; readonly retryAfterSeconds: number };

/**
 * Accepts or declines from the link. Accepting first confirms the meeting: the Meet room is made first (only when the meeting has none yet, and a failure leaves
 * the link empty without failing the answer), and the people of the lead are told by the database function and by the launch emails. A second answer of the same
 * kind changes nothing. A deadline that has passed, a closed meeting and an unknown token are refused without writing anything.
 */
export async function answerInvitationLink(deps: DomainDeps, input: { readonly token: string; readonly reply: string; readonly address: string }): Promise<InvitationAnswer> {
  const blocked = await firstBlockedLimit(deps.publicDb, invitationLinkChecks(input.address, true), deps.now());
  if (blocked !== null) return { status: "rate-limited", retryAfterSeconds: blocked.retryAfterSeconds };
  if (input.reply !== "accepted" && input.reply !== "declined") throw new DomainError("invalid-input", "Choose Accept or Decline.");
  const reply = input.reply;
  const current = await read(deps, input.token);
  if (current === null) return { status: "invalid" };
  if (current.view.status !== "open") return { status: current.view.status };
  const { details } = current.view;
  const room = reply === "accepted" && details.reply === "invited" && !details.hasRoom ? await createRoomSafely(deps.meet, { startsAt: details.startsAt, durationMinutes: details.minutes }) : null;
  try {
    const result = await deps.authDb.execute<{ confirmed_now: boolean; rescheduled: boolean; lead_id: string; meeting_id: string }>(
      sql`select confirmed_now, rescheduled, lead_id, meeting_id from public.app_reply_by_token(${hashInviteToken(input.token)}, ${reply}, ${room?.url ?? null}, ${room?.spaceId ?? null})`,
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("The reply returned no row");
    // The emails of a confirmed meeting, as the sweep queues them: no person is left out, since nobody signed in.
    if (row.confirmed_now) await enqueueLeadEmails(deps.authDb, { type: "meeting_scheduled", leadId: row.lead_id }, { system: true });
    return { status: "done", reply, confirmed: row.confirmed_now, needsNewTime: row.rescheduled };
  } catch (error) {
    const refusal = databaseRefusal(error, new Set(["not-found", "invalid-transition"]), "");
    if (refusal === null) throw error;
    return { status: refusal.code === "not-found" ? "invalid" : "expired" };
  }
}
