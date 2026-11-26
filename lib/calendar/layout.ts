import { earliestBookable, isSlotFree, overlaps, type Interval, type PersonTime } from "@/lib/calendar/free-time";
import { dayKeyIn, slotInstants } from "@/lib/calendar/view";
import type { HoursWindow } from "@/lib/domain/weekly-hours";
import { isOutsideHostHours } from "@/lib/leads/host-hours";

/** The hours a day grid shows, in the viewer's own zone, and the length of a slot. A person in another zone can work any of them. */
export const GRID_START_MINUTE = 6 * 60;
export const GRID_END_MINUTE = 22 * 60;
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

/** `off` is outside working hours, `busy` is taken, `soon` is free but too soon to book, `free` can be booked. */
export type SlotState = "off" | "busy" | "soon" | "free";

export interface Run {
  readonly state: SlotState;
  readonly fromMinute: number;
  readonly toMinute: number;
}

export interface FreeRun {
  readonly fromMinute: number;
  readonly toMinute: number;
  readonly free: number;
  readonly of: number;
}

function timeOf(person: CalendarPersonLike): PersonTime {
  return {
    availability: { timeZone: person.timeZone, hours: person.hours, blocks: [] },
    busy: person.busy.map((span) => ({ start: new Date(span.start), end: new Date(span.end) })),
  };
}

function stateOf(slot: Interval, time: PersonTime, now: Date): SlotState {
  const lastMinute = new Date(slot.end.getTime() - MINUTE);
  if (isOutsideHostHours(slot.start, time.availability) || isOutsideHostHours(lastMinute, time.availability)) return "off";
  if (time.busy.some((span) => overlaps(slot, span))) return "busy";
  return slot.start < earliestBookable(now) ? "soon" : "free";
}

function slotsOf(dayKey: string, zone: string): { readonly slot: Interval; readonly minute: number }[] {
  return slotInstants(dayKey, zone, GRID_START_MINUTE, GRID_END_MINUTE, SLOT_MINUTES).map((start, index) => ({
    slot: { start, end: new Date(start.getTime() + SLOT_MINUTES * MINUTE) },
    minute: GRID_START_MINUTE + index * SLOT_MINUTES,
  }));
}

/** One person's day as stretches of the same state, in the viewer's zone. */
export function dayRuns(person: CalendarPersonLike, dayKey: string, zone: string, now: Date): Run[] {
  const time = timeOf(person);
  const runs: Run[] = [];
  for (const { slot, minute } of slotsOf(dayKey, zone)) {
    const state = stateOf(slot, time, now);
    const last = runs[runs.length - 1];
    if (last !== undefined && last.state === state) runs[runs.length - 1] = { ...last, toMinute: minute + SLOT_MINUTES };
    else runs.push({ state, fromMinute: minute, toMinute: minute + SLOT_MINUTES });
  }
  return runs;
}

/** How many of the people are free in each stretch of a day. A stretch where nobody is free is left out. */
export function freeRuns(people: readonly CalendarPersonLike[], dayKey: string, zone: string, now: Date): FreeRun[] {
  const times = people.map(timeOf);
  const runs: FreeRun[] = [];
  for (const { slot, minute } of slotsOf(dayKey, zone)) {
    const free = times.filter((time) => isSlotFree(slot, time, now)).length;
    if (free === 0) continue;
    const last = runs[runs.length - 1];
    if (last !== undefined && last.free === free && last.toMinute === minute) runs[runs.length - 1] = { ...last, toMinute: minute + SLOT_MINUTES };
    else runs.push({ fromMinute: minute, toMinute: minute + SLOT_MINUTES, free, of: people.length });
  }
  return runs;
}

/** The half hours of a day in which at least one person is free. */
export function freeSlotCount(people: readonly CalendarPersonLike[], dayKey: string, zone: string, now: Date): number {
  const times = people.map(timeOf);
  return slotsOf(dayKey, zone).filter(({ slot }) => times.some((time) => isSlotFree(slot, time, now))).length;
}

/** The meetings that fall on a day in the viewer's zone, earliest first. */
export function meetingsOnDay<T extends { readonly start: string }>(meetings: readonly T[], dayKey: string, zone: string): T[] {
  return meetings.filter((meeting) => dayKeyIn(new Date(meeting.start), zone) === dayKey).sort((a, b) => a.start.localeCompare(b.start));
}
