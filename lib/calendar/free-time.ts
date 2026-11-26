import { isOutsideHostHours, type HostAvailability } from "@/lib/leads/host-hours";

/** A stretch of time. The end is not part of it, so two intervals that touch do not overlap. */
export interface Interval {
  readonly start: Date;
  readonly end: Date;
}

/** A booking must start at least this long from now, so an invited person always has a full day to accept (owner decision, 2026-11-26). */
export const MIN_NOTICE_HOURS = 48;
/** The most a calendar read covers. */
export const MAX_RANGE_DAYS = 62;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** One person's time: their working hours (run through `withDefaultHours` first) and everything else that makes them busy, with no reason attached. */
export interface PersonTime {
  readonly availability: HostAvailability;
  readonly busy: readonly Interval[];
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Sorts, drops empty intervals and joins those that overlap or touch. */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals.filter((item) => item.end > item.start).map((item) => ({ start: item.start, end: item.end })).sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Interval[] = [];
  for (const item of sorted) {
    const last = merged[merged.length - 1];
    if (last === undefined || item.start > last.end) merged.push(item);
    else if (item.end > last.end) merged[merged.length - 1] = { start: last.start, end: item.end };
  }
  return merged;
}

/** Throws a `RangeError` for an empty or backwards range, or one longer than 62 days. */
export function assertRange(range: Interval): void {
  if (!(range.end > range.start)) throw new RangeError("The end of a range must be after its start.");
  if (range.end.getTime() - range.start.getTime() > MAX_RANGE_DAYS * DAY) throw new RangeError(`A range covers at most ${MAX_RANGE_DAYS} days.`);
}

/** The earliest moment a meeting can start. */
export function earliestBookable(now: Date): Date {
  return new Date(now.getTime() + MIN_NOTICE_HOURS * HOUR);
}

/**
 * Whether one person is free for a slot: it starts after the notice, it lies inside their working hours, no blocked time or busy time overlaps it.
 * shortcut: only the first and the last minute are checked against the hours, so a slot longer than the gap in a split day would pass. Meetings are 30 to 60
 * minutes. Revisit if a campaign allows a longer meeting.
 */
export function isSlotFree(slot: Interval, person: PersonTime, now: Date): boolean {
  if (slot.start < earliestBookable(now)) return false;
  const lastMinute = new Date(slot.end.getTime() - MINUTE);
  if (isOutsideHostHours(slot.start, person.availability) || isOutsideHostHours(lastMinute, person.availability)) return false;
  if (person.availability.blocks.some((block) => overlaps(slot, { start: block.startsAt, end: block.endsAt }))) return false;
  return !person.busy.some((busy) => overlaps(slot, busy));
}

/**
 * The start of every free slot in a range, on the half hour by default. Slots line up on whole half hours of UTC.
 * shortcut: a zone that is 45 minutes off UTC (Nepal) sees its slots at :15 and :45 local, which is still correct but odd. Revisit if such a client appears.
 */
export function freeSlotStarts(range: Interval, durationMinutes: number, person: PersonTime, now: Date, stepMinutes = 30): Date[] {
  assertRange(range);
  const step = stepMinutes * MINUTE;
  const length = durationMinutes * MINUTE;
  const starts: Date[] = [];
  for (let at = Math.ceil(range.start.getTime() / step) * step; at + length <= range.end.getTime(); at += step) {
    const candidate = { start: new Date(at), end: new Date(at + length) };
    if (isSlotFree(candidate, person, now)) starts.push(candidate.start);
  }
  return starts;
}

/** The ids of the people who are free for a slot, in the order given. */
export function freePeopleAt(slot: Interval, people: readonly (PersonTime & { readonly memberId: string })[], now: Date): string[] {
  return people.filter((person) => isSlotFree(slot, person, now)).map((person) => person.memberId);
}
