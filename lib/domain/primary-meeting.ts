import type { MeetingStatus } from "./status";

/** The meeting a lead is shown and counted by: the earliest completed one, else the most recently added. Tiles, table rows and the counting month all use it. */
export function primaryMeeting<T extends { status: MeetingStatus; startsAt: string }>(meetings: readonly T[]): T | undefined {
  const completed = meetings.filter((m) => m.status === "completed").sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return completed[0] ?? meetings[meetings.length - 1];
}
