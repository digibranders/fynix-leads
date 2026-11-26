import { MINUTES_PER_DAY, type HoursWindow } from "@/lib/domain/weekly-hours";

/** A host's week as the lead form needs it: the zone the windows are set in, the weekly windows, and the times they cannot take meetings. */
export interface HostAvailability {
  /** The IANA zone of the windows, or null when the host has set none. */
  readonly timeZone: string | null;
  readonly hours: readonly HoursWindow[];
  readonly blocks: readonly { readonly startsAt: Date; readonly endsAt: Date }[];
}

/** What a person who has set no hours is taken to work: Monday to Friday, 09:00 to 17:00 (owner decision, 2026-11-26). */
export const DEFAULT_HOURS: readonly HoursWindow[] = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 17 * 60 }));

const FALLBACK_ZONE = "Europe/London";

/** The zone if the runtime knows it, Europe/London otherwise: a zone typed wrong never stops a booking. */
function usableZone(zone: string | null): string {
  if (zone === null) return FALLBACK_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return FALLBACK_ZONE;
  }
}

/** A person's own hours when they have set any, the default week in the client's zone when they have not. Blocked times are kept either way. */
export function withDefaultHours(availability: HostAvailability, clientTimeZone: string | null): HostAvailability {
  if (availability.hours.length > 0) return availability;
  return { ...availability, timeZone: usableZone(clientTimeZone), hours: DEFAULT_HOURS };
}

const QUARTER_MINUTES = 15;
const MINUTE = 60_000;

interface LocalParts {
  readonly weekday: number;
  readonly minute: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// Building a formatter is slow and a month view asks thousands of times, so one is kept for each zone and shape.
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string, shape: "weekday-time" | "date-time"): Intl.DateTimeFormat {
  const key = `${shape}|${timeZone}`;
  let found = formatters.get(key);
  if (found === undefined) {
    found =
      shape === "weekday-time"
        ? new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" })
        : new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" });
    formatters.set(key, found);
  }
  return found;
}

/** The weekday (0 is Sunday) and the minute of the day an instant has in a zone. */
function localParts(instant: Date, timeZone: string): LocalParts {
  const parts = Object.fromEntries(formatter(timeZone, "weekday-time").formatToParts(instant).map((part) => [part.type, part.value]));
  return { weekday: WEEKDAYS.indexOf(parts.weekday as (typeof WEEKDAYS)[number]), minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** The offset of a zone from UTC at an instant, in milliseconds. */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(formatter(timeZone, "date-time").formatToParts(instant).map((part) => [part.type, Number(part.value)]));
  return Date.UTC(parts.year ?? 0, (parts.month ?? 1) - 1, parts.day ?? 1, parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0) - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant at which a wall clock reads `minute` minutes after midnight on `day` ("YYYY-MM-DD") in a zone. Read twice so a day that changes its offset still lands right. */
export function wallClockToInstant(day: string, minute: number, timeZone: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  const naive = Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1, 0, minute);
  const first = naive - offsetMs(new Date(naive), timeZone);
  return new Date(naive - offsetMs(new Date(first), timeZone));
}

/**
 * Whether a time falls outside the host's working hours: before or after every window of its weekday in the host's zone, inside a blocked time, or
 * anywhere when the host has set no hours at all. The lead form warns on it and never blocks.
 */
export function isOutsideHostHours(time: Date, availability: HostAvailability): boolean {
  if (availability.timeZone === null || availability.hours.length === 0) return true;
  const { weekday, minute } = localParts(time, availability.timeZone);
  const inWindow = availability.hours.some((window) => window.weekday === weekday && minute >= window.startMinute && minute < window.endMinute);
  if (!inWindow) return true;
  return availability.blocks.some((block) => time.getTime() >= block.startsAt.getTime() && time.getTime() < block.endsAt.getTime());
}

/**
 * The quarter-hour starts a host can take on one day ("YYYY-MM-DD" in the host's zone): every quarter that lies inside a window of that weekday, is not
 * inside a blocked time, and is not before `notBefore`. A window's last quarter is the one that starts fifteen minutes before it ends.
 */
export function quarterHourSlotsForHost(day: string, availability: HostAvailability, options: { readonly notBefore?: Date } = {}): Date[] {
  if (availability.timeZone === null) return [];
  const timeZone = availability.timeZone;
  const weekday = localParts(wallClockToInstant(day, 12 * 60, timeZone), timeZone).weekday;
  const slots: Date[] = [];
  for (const window of availability.hours.filter((entry) => entry.weekday === weekday)) {
    for (let minute = window.startMinute; minute + QUARTER_MINUTES <= Math.min(window.endMinute, MINUTES_PER_DAY); minute += QUARTER_MINUTES) {
      const start = wallClockToInstant(day, minute, timeZone);
      if (options.notBefore !== undefined && start.getTime() < options.notBefore.getTime()) continue;
      if (availability.blocks.some((block) => start.getTime() + QUARTER_MINUTES * MINUTE > block.startsAt.getTime() && start.getTime() < block.endsAt.getTime())) continue;
      slots.push(start);
    }
  }
  return slots.sort((a, b) => a.getTime() - b.getTime());
}

export type ProposedTimeWarningCode = "no_host_hours" | "outside_host_hours" | "host_blocked";

export interface ProposedTimeWarning {
  /** The proposed time, as an ISO instant. Empty for the one warning that is about the host. */
  readonly time: string;
  readonly code: ProposedTimeWarningCode;
  readonly message: string;
}

/**
 * What the lead form warns about before it sends: a proposed time outside the host's hours, or inside a blocked time. A host with no hours gets one warning
 * for the whole list. These are warnings only: the client picks the time, and a lead is never refused for them.
 */
export function proposedTimeWarnings(times: readonly Date[], availability: HostAvailability): ProposedTimeWarning[] {
  if (availability.timeZone === null || availability.hours.length === 0) {
    return [{ time: "", code: "no_host_hours", message: "This person has not set working hours, so the times cannot be checked." }];
  }
  const warnings: ProposedTimeWarning[] = [];
  for (const time of times) {
    const { weekday, minute } = localParts(time, availability.timeZone);
    const inWindow = availability.hours.some((window) => window.weekday === weekday && minute >= window.startMinute && minute < window.endMinute);
    if (!inWindow) warnings.push({ time: time.toISOString(), code: "outside_host_hours", message: "This time is outside their working hours." });
    else if (isOutsideHostHours(time, availability)) warnings.push({ time: time.toISOString(), code: "host_blocked", message: "They have blocked this time." });
  }
  return warnings;
}
