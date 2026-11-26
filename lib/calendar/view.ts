import { wallClockToInstant } from "@/lib/leads/host-hours";

export const CALENDAR_VIEWS = ["month", "week", "day"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

/** What a calendar page shows: a view and a day ("YYYY-MM-DD") inside it. Both live in the address. */
export interface CalendarQuery {
  readonly view: CalendarView;
  readonly date: string;
}

const MS_DAY = 86_400_000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const utc = (key: string): number => Date.parse(`${key}T00:00:00Z`);
const keyOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Whether a string is a real calendar day, not just one shaped like it (2026-02-30 is not). */
export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = utc(value);
  return !Number.isNaN(ms) && keyOf(ms) === value;
}

/** The view and day asked for in the address. Anything missing or unusable becomes the week of `today`. */
export function parseCalendarQuery(raw: { readonly view?: string; readonly date?: string }, today: string): CalendarQuery {
  const view = (CALENDAR_VIEWS as readonly string[]).includes(raw.view ?? "") ? (raw.view as CalendarView) : "week";
  return { view, date: isDayKey(raw.date) ? raw.date : today };
}

export function addDays(key: string, days: number): string {
  return keyOf(utc(key) + days * MS_DAY);
}

/** The Monday of the week a day falls in. */
export function weekStart(key: string): string {
  const weekday = new Date(utc(key)).getUTCDay();
  return addDays(key, -((weekday + 6) % 7));
}

function monthStart(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

function addMonths(key: string, months: number): string {
  const date = new Date(utc(monthStart(key)));
  return keyOf(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

/** The weeks of a month, Monday to Sunday, running into the month before and after to fill them. */
export function monthGrid(key: string): { readonly key: string; readonly inMonth: boolean }[][] {
  const first = monthStart(key);
  const next = addMonths(key, 1);
  const grid: { key: string; inMonth: boolean }[][] = [];
  for (let day = weekStart(first); day < next; day = addDays(day, 7)) {
    grid.push(Array.from({ length: 7 }, (_, index) => ({ key: addDays(day, index), inMonth: addDays(day, index).slice(0, 7) === first.slice(0, 7) })));
  }
  return grid;
}

/** The same view one step on: a day, a week or a month. */
export function shiftQuery(query: CalendarQuery, direction: -1 | 1): CalendarQuery {
  if (query.view === "day") return { view: "day", date: addDays(query.date, direction) };
  if (query.view === "week") return { view: "week", date: addDays(query.date, 7 * direction) };
  return { view: "month", date: addMonths(query.date, direction) };
}

/**
 * The stretch of time to read for a view: its days plus one day each side, so a viewer in any time zone has every moment of the days on screen. Counted in UTC
 * because the server does not know the viewer's zone. Never longer than the 62 days a read may cover.
 */
export function fetchRange(query: CalendarQuery): { readonly from: Date; readonly to: Date } {
  const days = visibleDays(query);
  return { from: new Date(utc(addDays(days[0] ?? query.date, -1))), to: new Date(utc(addDays(days[days.length - 1] ?? query.date, 2))) };
}

/** Every day a view shows, in order. */
export function visibleDays(query: CalendarQuery): string[] {
  if (query.view === "day") return [query.date];
  if (query.view === "week") return Array.from({ length: 7 }, (_, index) => addDays(weekStart(query.date), index));
  return monthGrid(query.date).flat().map((cell) => cell.key);
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();
function clockFormatter(zone: string): Intl.DateTimeFormat {
  let found = dayFormatters.get(zone);
  if (found === undefined) {
    found = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "numeric", hourCycle: "h23" });
    dayFormatters.set(zone, found);
  }
  return found;
}

function partsIn(at: Date, zone: string): { readonly day: string; readonly minute: number } {
  const parts = Object.fromEntries(clockFormatter(zone).formatToParts(at).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** The day an instant falls on in a zone. */
export function dayKeyIn(at: Date, zone: string): string {
  return partsIn(at, zone).day;
}

/** Minutes from local midnight, 0 to 1439, in a zone. */
export function minutesIntoDay(at: Date, zone: string): number {
  return partsIn(at, zone).minute;
}

/** The instants of the slots of one local day, from one minute of the day to another, every `stepMinutes`. */
export function slotInstants(key: string, zone: string, fromMinute: number, toMinute: number, stepMinutes: number): Date[] {
  const starts: Date[] = [];
  for (let minute = fromMinute; minute < toMinute; minute += stepMinutes) starts.push(wallClockToInstant(key, minute, zone));
  return starts;
}

const part = (key: string): { readonly year: number; readonly month: number; readonly day: number; readonly weekday: number } => {
  const date = new Date(utc(key));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate(), weekday: date.getUTCDay() };
};

/** A short label for a day: "Mon 23". */
export function dayLabel(key: string): string {
  const { day, weekday } = part(key);
  return `${WEEKDAYS[weekday]} ${day}`;
}

/** The title above a view: "Thu 26 November 2026", "23 to 29 November 2026" or "November 2026". */
export function titleFor(query: CalendarQuery): string {
  const at = part(query.date);
  if (query.view === "month") return `${MONTHS[at.month]} ${at.year}`;
  if (query.view === "day") return `${WEEKDAYS[at.weekday]} ${at.day} ${MONTHS[at.month]} ${at.year}`;
  const first = part(weekStart(query.date));
  const last = part(addDays(weekStart(query.date), 6));
  return first.month === last.month ? `${first.day} to ${last.day} ${MONTHS[last.month]} ${last.year}` : `${first.day} ${MONTHS[first.month]} to ${last.day} ${MONTHS[last.month]} ${last.year}`;
}

/** The address of a view, with the client chosen (a campaign id that names its team) when there is one. */
export function calendarHref(basePath: string, query: CalendarQuery, team: string | null): string {
  const params = new URLSearchParams({ view: query.view, date: query.date });
  if (team !== null) params.set("team", team);
  return `${basePath}?${params.toString()}`;
}
