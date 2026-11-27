import { overlaps, type Interval, type PersonTime } from "@/lib/calendar/free-time";
import { dayKeyIn, slotInstants } from "@/lib/calendar/view";
import type { HoursWindow } from "@/lib/domain/weekly-hours";

/** The hours a day grid shows, in the viewer's own zone, and the length of a slot. The whole day: a meeting can be at any hour, and a person in another zone works at any of them. */
export const GRID_START_MINUTE = 0;
export const GRID_END_MINUTE = 24 * 60;
export const SLOT_MINUTES = 30;

const MINUTE = 60_000;

/** A person as the screens receive them: plain text and numbers. */
export interface CalendarPersonLike {
  readonly memberId: string;
  readonly displayName: string;
  readonly timeZone: string;
  readonly hours: readonly HoursWindow[];
  readonly busy: readonly { readonly start: string; readonly end: string }[];
}

/** A stretch of a day, in minutes from midnight in the viewer's zone. */
export interface Run {
  readonly fromMinute: number;
  readonly toMinute: number;
}

export function personTime(person: CalendarPersonLike): PersonTime {
  return {
    availability: { timeZone: person.timeZone, hours: person.hours, blocks: [] },
    busy: person.busy.map((span) => ({ start: new Date(span.start), end: new Date(span.end) })),
  };
}

function slotsOf(dayKey: string, zone: string): { readonly slot: Interval; readonly minute: number }[] {
  return slotInstants(dayKey, zone, GRID_START_MINUTE, GRID_END_MINUTE, SLOT_MINUTES).map((start, index) => ({
    slot: { start, end: new Date(start.getTime() + SLOT_MINUTES * MINUTE) },
    minute: GRID_START_MINUTE + index * SLOT_MINUTES,
  }));
}

/**
 * One person's booked time on a day, in the viewer's zone: what a meeting, an open invitation or a blocked time takes, as stretches of the same kind. Free time and working
 * hours are not drawn, only what is taken.
 */
export function bookedRuns(person: CalendarPersonLike, dayKey: string, zone: string): Run[] {
  const busy = personTime(person).busy;
  const runs: Run[] = [];
  for (const { slot, minute } of slotsOf(dayKey, zone)) {
    if (!busy.some((span) => overlaps(slot, span))) continue;
    const last = runs[runs.length - 1];
    if (last !== undefined && last.toMinute === minute) runs[runs.length - 1] = { ...last, toMinute: minute + SLOT_MINUTES };
    else runs.push({ fromMinute: minute, toMinute: minute + SLOT_MINUTES });
  }
  return runs;
}

/** The meetings that fall on a day in the viewer's zone, earliest first. */
export function meetingsOnDay<T extends { readonly start: string }>(meetings: readonly T[], dayKey: string, zone: string): T[] {
  return meetings.filter((meeting) => dayKeyIn(new Date(meeting.start), zone) === dayKey).sort((a, b) => a.start.localeCompare(b.start));
}
