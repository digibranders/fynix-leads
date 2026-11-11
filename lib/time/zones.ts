const LOCALES_FOR_NAMES = ["en-US", "en-IN", "en-GB"] as const;

function part(date: Date, timeZone: string, locale: string, options: Intl.DateTimeFormatOptions, type: string): string {
  const found = new Intl.DateTimeFormat(locale, { timeZone, ...options })
    .formatToParts(date)
    .find((p) => p.type === type);
  if (!found) throw new Error(`Intl returned no "${type}" part for ${timeZone}`);
  return found.value;
}

/** A readable zone name: "IST", "EST", "BST", else a GMT offset such as "GMT+4". */
export function zoneAbbreviation(date: Date, timeZone: string): string {
  const names = LOCALES_FOR_NAMES.map((l) => part(date, timeZone, l, { timeZoneName: "short" }, "timeZoneName"));
  return names.find((n) => n === "GMT" || !n.startsWith("GMT")) ?? names[0];
}

/** "Thu 12 Nov, 3:00 pm IST" in the given IANA time zone. */
export function formatInZone(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.weekday} ${parts.day} ${parts.month}, ${parts.hour}:${parts.minute} ${parts.dayPeriod.toLowerCase()} ${zoneAbbreviation(date, timeZone)}`;
}

/** "Thu 12 Nov" in the given IANA time zone. */
export function formatDayInZone(date: Date, timeZone: string): string {
  const get = (type: string) =>
    part(date, timeZone, "en-US", { weekday: "short", day: "numeric", month: "short" }, type);
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

/** "3:00 pm" in the given IANA time zone, without the zone name. */
export function formatTimeInZone(date: Date, timeZone: string): string {
  const get = (type: string) =>
    part(date, timeZone, "en-US", { hour: "numeric", minute: "2-digit", hour12: true }, type);
  return `${get("hour")}:${get("minute")} ${get("dayPeriod").toLowerCase()}`;
}

/** Spec section 9: warn when a time falls before 8 am or from 7 pm in that zone. */
export function isOutsideWorkingHours(date: Date, timeZone: string, startHour = 8, endHour = 19): boolean {
  const hour = Number(part(date, timeZone, "en-US", { hour: "numeric", hourCycle: "h23" }, "hour"));
  return hour < startHour || hour >= endHour;
}

/** "2026-08" for the calendar month a moment falls in, in the given IANA time zone. */
export function monthInZone(date: Date, timeZone: string): string {
  const get = (type: string) => part(date, timeZone, "en-US", { year: "numeric", month: "2-digit" }, type);
  return `${get("year")}-${get("month")}`;
}
