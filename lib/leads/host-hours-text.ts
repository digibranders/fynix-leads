import { sortWindows, type HoursWindow } from "@/lib/domain/weekly-hours";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** Monday first, the way a week is read. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** "9:00 am" from minutes after midnight. 1440 reads as midnight. */
function clock(minute: number): string {
  const hour = Math.floor(minute / 60) % 24;
  const rest = minute % 60;
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(rest).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`;
}

/** "Mon to Fri" for a run of three or more days in a row, else the days joined with commas. */
function dayList(days: readonly number[]): string {
  const order = WEEK_ORDER.filter((day) => days.includes(day));
  const runs: number[][] = [];
  for (const day of order) {
    const last = runs[runs.length - 1];
    if (last !== undefined && WEEK_ORDER.indexOf(last[last.length - 1] as (typeof WEEK_ORDER)[number]) + 1 === WEEK_ORDER.indexOf(day)) last.push(day);
    else runs.push([day]);
  }
  return runs.map((run) => (run.length >= 3 ? `${DAYS[run[0] as number]} to ${DAYS[run[run.length - 1] as number]}` : run.map((day) => DAYS[day]).join(", "))).join(", ");
}

/**
 * A host's week in a few short lines for the lead form: days that share the same hours are grouped ("Mon to Fri 9:00 am to 5:00 pm"). Empty when the host has
 * set no hours.
 */
export function describeHostHours(windows: readonly HoursWindow[]): string[] {
  const byRange = new Map<string, number[]>();
  for (const window of sortWindows(windows)) {
    const range = `${clock(window.startMinute)} to ${clock(window.endMinute)}`;
    byRange.set(range, [...(byRange.get(range) ?? []), window.weekday]);
  }
  return [...byRange.entries()].map(([range, days]) => `${dayList(days)} ${range}`);
}
