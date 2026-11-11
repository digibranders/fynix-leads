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
