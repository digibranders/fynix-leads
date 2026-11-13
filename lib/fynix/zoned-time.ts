/** Turns a wall-clock date and time in an IANA zone into the instant it names, which is what a blocked time is stored as. */

function wallParts(instant: number, timeZone: string): { readonly date: string; readonly time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2})$/;

/**
 * The instant at `date` (`YYYY-MM-DD`) and `time` (`HH:MM`) on the wall clock of `timeZone`, or `null` when the text is not a real
 * date and time, or the time does not exist in that zone (the hour skipped when the clocks go forward). A time that happens twice
 * (the hour repeated when the clocks go back) is read as the later one.
 */
export function zonedWallTimeToInstant(date: string, time: string, timeZone: string): Date | null {
  const day = DATE.exec(date);
  const clock = TIME.exec(time);
  if (day === null || clock === null) return null;
  const [year, month, dayOfMonth] = [Number(day[1]), Number(day[2]), Number(day[3])];
  const [hour, minute] = [Number(clock[1]), Number(clock[2])];
  const asUtc = Date.UTC(year, month - 1, dayOfMonth, hour, minute);
  const check = new Date(asUtc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== dayOfMonth || hour > 23 || minute > 59) return null;

  const offsetAt = (instant: number): number => {
    const wall = wallParts(instant, timeZone);
    const [wy, wm, wd] = wall.date.split("-").map(Number) as [number, number, number];
    const [wh, wmin] = wall.time.split(":").map(Number) as [number, number];
    return Date.UTC(wy, wm - 1, wd, wh, wmin) - instant;
  };
  let instant = asUtc - offsetAt(asUtc);
  // One more pass settles the offset when the guess fell on the other side of a clock change.
  instant = asUtc - offsetAt(instant);
  const back = wallParts(instant, timeZone);
  return back.date === date && back.time === time ? new Date(instant) : null;
}

/** The day after `date` (`YYYY-MM-DD`), or `null` when `date` is not a real date. */
export function nextDay(date: string): string | null {
  const day = DATE.exec(date);
  if (day === null) return null;
  const moved = new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]) + 1));
  return moved.toISOString().slice(0, 10);
}
