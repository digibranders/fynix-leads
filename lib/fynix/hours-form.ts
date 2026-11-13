import type { HoursWindow } from "@/lib/domain/weekly-hours";
import { MINUTES_PER_DAY } from "@/lib/domain/weekly-hours";
import { WEEK_ORDER } from "@/lib/fynix/format";

/** The weekly hours form: seven days, each with up to four ranges of `<input type="time">`. */
export const MAX_RANGES_PER_DAY = 4;

const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export const rangeField = (weekday: number, index: number, edge: "from" | "to"): string => `day-${weekday}-${index}-${edge}`;
export const dayField = (weekday: number): string => `day-${weekday}`;

const TIME = /^(\d{2}):(\d{2})$/;

/** "09:00" is minute 540. A time input cannot say 24:00, so 23:59 as the end of a range means the end of the day. */
export function parseTime(text: string, isEnd: boolean): number | null {
  const parts = TIME.exec(text.trim());
  if (parts === null) return null;
  const hour = Number(parts[1]);
  const minute = Number(parts[2]);
  if (hour > 23 || minute > 59) return null;
  return isEnd && hour === 23 && minute === 59 ? MINUTES_PER_DAY : hour * 60 + minute;
}

/** The value for a time input: minute 540 is "09:00", and the end of the day is "23:59". */
export function timeValue(minute: number): string {
  const clamped = Math.min(minute, MINUTES_PER_DAY - 1);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

export interface HoursGrid {
  readonly windows: readonly HoursWindow[];
  /** A sentence per day that has a problem, keyed by `dayField(weekday)`. */
  readonly errors: Readonly<Record<string, string>>;
}

/** Reads the ranges the form sent. A range with both boxes empty is skipped; one box filled is a problem; a day may not overlap itself. */
export function parseHoursGrid(get: (name: string) => string): HoursGrid {
  const windows: HoursWindow[] = [];
  const errors: Record<string, string> = {};
  for (const weekday of WEEK_ORDER) {
    const day: HoursWindow[] = [];
    for (let index = 0; index < MAX_RANGES_PER_DAY; index += 1) {
      const from = get(rangeField(weekday, index, "from")).trim();
      const to = get(rangeField(weekday, index, "to")).trim();
      if (from === "" && to === "") continue;
      const startMinute = parseTime(from, false);
      const endMinute = parseTime(to, true);
      if (startMinute === null || endMinute === null) {
        errors[dayField(weekday)] ??= `${DAY_LONG[weekday]}: enter both a start and an end.`;
      } else if (startMinute >= endMinute) {
        errors[dayField(weekday)] ??= `${DAY_LONG[weekday]}: the end must be after the start.`;
      } else {
        day.push({ weekday, startMinute, endMinute });
      }
    }
    day.sort((a, b) => a.startMinute - b.startMinute);
    if (day.some((slot, index) => index > 0 && slot.startMinute < (day[index - 1]?.endMinute ?? 0))) {
      errors[dayField(weekday)] ??= `${DAY_LONG[weekday]}: ranges must not overlap.`;
    }
    windows.push(...day);
  }
  return { windows, errors };
}
