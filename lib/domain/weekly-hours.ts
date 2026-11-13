export const MINUTES_PER_DAY = 1440;

/** One block of working time on one weekday: `weekday` 0 is Sunday and 6 is Saturday, minutes count from midnight in the host's own time zone. */
export interface HoursWindow {
  readonly weekday: number;
  readonly startMinute: number;
  readonly endMinute: number;
}

/** A copy ordered by weekday, then start. */
export function sortWindows<T extends HoursWindow>(windows: readonly T[]): T[] {
  return [...windows].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
}

/**
 * The first rule a weekly set breaks, in words that never quote a value, or `null` when the set is fine. A window must be
 * whole minutes inside one day and start before it ends; windows on one day must not overlap, though one may start the
 * minute another ends. The database repeats the bounds as constraints and the overlap as a trigger (migration 0028).
 */
export function findHoursProblem(windows: readonly HoursWindow[]): string | null {
  for (const slot of windows) {
    if (!Number.isInteger(slot.weekday) || slot.weekday < 0 || slot.weekday > 6) return "weekday must be a whole number from 0 (Sunday) to 6 (Saturday)";
    if (!Number.isInteger(slot.startMinute) || !Number.isInteger(slot.endMinute) || slot.startMinute < 0 || slot.endMinute > MINUTES_PER_DAY) {
      return "start and end must be whole minutes from 0 to 1440";
    }
    if (slot.startMinute >= slot.endMinute) return "each window must start before it ends";
  }
  const sorted = sortWindows(windows);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous !== undefined && current !== undefined && previous.weekday === current.weekday && current.startMinute < previous.endMinute) {
      return "windows on the same day must not overlap";
    }
  }
  return null;
}
