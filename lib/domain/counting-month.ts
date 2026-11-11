import { isDelivered } from "./delivered";
import type { ApprovalStatus, MeetingStatus } from "./status";

// OPEN QUESTION (spec section 16, item 2): which month a delivered lead counts toward. Prototype uses the meeting month. This is the only place that decides it.
export function countingMonth(lead: {
  approval: ApprovalStatus;
  meetings: readonly { status: MeetingStatus; startsAt: string }[];
}): string | null {
  if (!isDelivered(lead)) return null;
  const times = lead.meetings.filter((m) => m.status === "completed").map((m) => Date.parse(m.startsAt));
  return new Date(Math.min(...times)).toISOString().slice(0, 7);
}
