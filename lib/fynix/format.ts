import type { HoursWindow } from "@/lib/domain/weekly-hours";
import { MINUTES_PER_DAY } from "@/lib/domain/weekly-hours";
import { formatDayInZone, zoneAbbreviation } from "@/lib/time/zones";

/** Plain-text formatting for the Fynix admin screens: working hours, blocked times and dates. No component code, so it is tested in Node. */

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DAY_PLURAL = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"] as const;
/** Weekday numbers in the order a week is shown: Monday first, Sunday last. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function dayName(weekday: number): string {
  return DAY_SHORT[weekday] ?? "";
}

/** "9:00 am", "12:00 pm", "12:00 am". Minute 1440 is the midnight that ends a day. */
export function formatClock(minute: number): string {
  const wrapped = minute % MINUTES_PER_DAY;
  const hour = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(mins).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`;
}

/** "9:00 am to 5:00 pm"; the period is written once when both ends share it ("2:00 to 5:00 pm"). */
export function formatRange(startMinute: number, endMinute: number): string {
  const start = formatClock(startMinute);
  const end = formatClock(endMinute);
  return start.slice(-2) === end.slice(-2) ? `${start.slice(0, -3)} to ${end}` : `${start} to ${end}`;
}

function windowsOn(windows: readonly HoursWindow[], weekday: number): HoursWindow[] {
  return windows.filter((slot) => slot.weekday === weekday).sort((a, b) => a.startMinute - b.startMinute);
}

/** One day's hours: "9:00 am to 12:00 pm, 2:00 to 5:00 pm", or `null` when the day has none. */
export function formatDayHours(windows: readonly HoursWindow[], weekday: number): string | null {
  const day = windowsOn(windows, weekday);
  return day.length === 0 ? null : day.map((slot) => formatRange(slot.startMinute, slot.endMinute)).join(", ");
}

/** "Mon to Thu", "Mon, Wed and Fri", "Mon to Wed and Fri". Runs of three or more days collapse; the week starts on Monday. */
export function formatDays(weekdays: readonly number[]): string {
  const positions = WEEK_ORDER.map((weekday, index) => (weekdays.includes(weekday) ? index : -1)).filter((index) => index >= 0);
  const parts: string[] = [];
  for (let at = 0; at < positions.length; ) {
    let to = at;
    while (to + 1 < positions.length && positions[to + 1] === (positions[to] ?? 0) + 1) to += 1;
    const first = dayName(WEEK_ORDER[positions[at] ?? 0] ?? 0);
    const last = dayName(WEEK_ORDER[positions[to] ?? 0] ?? 0);
    if (to - at >= 2) parts.push(`${first} to ${last}`);
    else for (let index = at; index <= to; index += 1) parts.push(dayName(WEEK_ORDER[positions[index] ?? 0] ?? 0));
    at = to + 1;
  }
  return parts.length < 2 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The two lines of the Weekly hours column: the days, then the hours ("Split on Wednesdays", or "Hours vary by day"). `null` when no hours are set. */
export function weekSummary(windows: readonly HoursWindow[]): { readonly days: string; readonly detail: string } | null {
  const working = WEEK_ORDER.filter((weekday) => windowsOn(windows, weekday).length > 0);
  if (working.length === 0) return null;
  const days = formatDays(working);
  const split = working.filter((weekday) => windowsOn(windows, weekday).length > 1);
  if (split.length > 0) return { days, detail: `Split on ${join(split.map((weekday) => DAY_PLURAL[weekday] ?? ""))}` };
  const texts = new Set(working.map((weekday) => formatDayHours(windows, weekday)));
  return { days, detail: texts.size === 1 ? ([...texts][0] ?? "") : "Hours vary by day" };
}

function join(items: readonly string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "London time (GMT)": the city from the zone name and the abbreviation in force at `at`. */
export function zoneLabel(timeZone: string, at: Date): string {
  if (timeZone === "UTC") return "UTC";
  const city = (timeZone.split("/").pop() ?? timeZone).replaceAll("_", " ");
  return `${city} time (${zoneAbbreviation(at, timeZone)})`;
}

/** The short form used under a campaign title: "London time". */
export function zoneCity(timeZone: string): string {
  return timeZone === "UTC" ? "UTC" : `${(timeZone.split("/").pop() ?? timeZone).replaceAll("_", " ")} time`;
}

function localParts(date: Date, timeZone: string): { readonly year: number; readonly month: number; readonly day: number; readonly minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" })
      .formatToParts(date)
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  return { year: parts.year ?? 0, month: parts.month ?? 0, day: parts.day ?? 0, minute: (parts.hour ?? 0) * 60 + (parts.minute ?? 0) };
}

/**
 * A blocked time in two parts, in the zone of the host's hours: the day or days, then what part of them. "Mon 23 Nov" and "all day";
 * "Thu 26 Nov" and "2:00 to 4:00 pm"; "Mon 23 Nov to Wed 25 Nov" and "all day"; or, across midnight, "Mon 23 Nov" and
 * "10:00 pm to Tue 24 Nov, 6:00 am".
 */
export function blockParts(startsAt: Date, endsAt: Date, timeZone: string): { readonly day: string; readonly detail: string } {
  const start = localParts(startsAt, timeZone);
  const end = localParts(endsAt, timeZone);
  const startDay = formatDayInZone(startsAt, timeZone);
  if (start.minute === 0 && end.minute === 0) {
    const lastDay = formatDayInZone(new Date(endsAt.getTime() - 3_600_000), timeZone);
    return { day: lastDay === startDay ? startDay : `${startDay} to ${lastDay}`, detail: "all day" };
  }
  const endDay = formatDayInZone(endsAt, timeZone);
  if (endDay === startDay && start.year === end.year) return { day: startDay, detail: formatRange(start.minute, end.minute) };
  return { day: startDay, detail: `${formatClock(start.minute)} to ${endDay}, ${formatClock(end.minute)}` };
}

/** A blocked time as one line: "Mon 23 Nov, all day", "Thu 26 Nov, 2:00 to 4:00 pm". */
export function formatBlock(startsAt: Date, endsAt: Date, timeZone: string): string {
  const { day, detail } = blockParts(startsAt, endsAt, timeZone);
  return `${day}, ${detail}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "2 Oct 2026" in the zone. */
export function formatDate(date: Date, timeZone: string): string {
  const { year, month, day } = localParts(date, timeZone);
  return `${day} ${MONTHS[month - 1] ?? ""} ${year}`;
}

/** "2 Oct", for a date in the current year or a short line. */
export function formatDayMonth(date: Date, timeZone: string): string {
  const { month, day } = localParts(date, timeZone);
  return `${day} ${MONTHS[month - 1] ?? ""}`;
}

/** "Wed 4 Nov". */
export function formatWeekdayDate(date: Date, timeZone: string): string {
  return formatDayInZone(date, timeZone);
}

/** The first letter in capitals, for a line that starts a sentence. */
export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "November", for the month a column of counts is about, read in the zone. */
export function monthName(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, month: "long" }).format(date);
}

/** "30 minute meetings". */
export function meetingLength(minutes: number): string {
  return `${minutes} minute meetings`;
}

/** "1 agency", "2 agencies". */
export function countOf(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
