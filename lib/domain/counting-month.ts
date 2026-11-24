import { monthInZone } from "@/lib/time/zones";
import { isDelivered } from "./delivered";
import { primaryMeeting } from "./primary-meeting";
import type { ApprovalStatus, MeetingStatus } from "./status";

// OPEN QUESTIONS (spec section 16, item 2): which month a delivered lead counts toward, and in which time zone that month is read.
// The prototype uses the month of the earliest completed meeting, read in the campaign zone. This is the only place that decides it.
export function countingMonth(
  lead: {
    approval: ApprovalStatus;
    meetings: readonly { status: MeetingStatus; startsAt: string }[];
  },
  zone: string,
): string | null {
  if (!isDelivered(lead)) return null;
  const meeting = primaryMeeting(lead.meetings);
  return meeting ? monthInZone(new Date(meeting.startsAt), zone) : null;
}

/**
 * The counting rule of the lead flow decision (2026-11-24), in one place for every screen and every query:
 * a lead adds one when it is accepted (by the client, by the 48 hour sweep or by Fynix) or when the client did not come to the meeting;
 * a rejection, a prospect no-show and anything still open add nothing. `delivered` is the old name for an accepted lead and keeps counting.
 */
export const COUNTED_STAGES = ["accepted", "delivered", "client_no_show"] as const;

export function isCountedStage(stage: string): boolean {
  return (COUNTED_STAGES as readonly string[]).includes(stage);
}

/** The month a counted lead belongs to: the month its meeting was held, read in the campaign's time zone ("YYYY-MM"). */
export function countedMonth(meetingTime: Date, campaignTimeZone: string): string {
  return monthInZone(meetingTime, campaignTimeZone);
}

/** The hours before a meeting inside which a rejection is the open question of the lead flow note. */
export const LATE_REJECTION_HOURS = 24;

/**
 * Whether a client's rejection less than 24 hours before the meeting counts as one. OPEN with the owner: see "Still open" in
 * `docs/superpowers/specs/2026-11-24-lead-flow-decision.md` (the choices are a client no-show that counts as one, zero as for any early
 * rejection, or a decision by Fynix). Until he answers it counts zero, the same as any early rejection. This is the only place to change.
 */
export function lateRejectionCounts(_meetingTime: Date, _now: Date): boolean {
  return false;
}
