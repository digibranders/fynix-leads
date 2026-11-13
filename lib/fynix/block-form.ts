import { nextDay, zonedWallTimeToInstant } from "@/lib/fynix/zoned-time";

export interface BlockForm {
  /** ISO instants with a Z, ready for the domain, or `null` when the form has a problem. */
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  /** A sentence per field, keyed by the field name. */
  readonly errors: Readonly<Record<string, string>>;
}

/**
 * Reads the Block a time form into two instants, in the zone the host's hours are in. Fields: `date`, `endDate` (optional, for a
 * run of days), `allDay` (a checkbox), `start` and `end`. An all day block runs from midnight to the next midnight of the last day.
 */
export function parseBlockForm(get: (name: string) => string, timeZone: string): BlockForm {
  const errors: Record<string, string> = {};
  const date = get("date").trim();
  const lastDate = get("endDate").trim() === "" ? date : get("endDate").trim();
  const allDay = get("allDay") === "on";

  if (nextDay(date) === null) errors.date = "Choose the day.";
  else if (nextDay(lastDate) === null) errors.endDate = "Choose the last day, or leave it empty.";
  else if (lastDate < date) errors.endDate = "The last day must not be before the first day.";
  if (Object.keys(errors).length > 0) return { startsAt: null, endsAt: null, errors };

  let startText = "00:00";
  let endText = "00:00";
  let endDate = lastDate;
  if (allDay) {
    endDate = nextDay(lastDate) ?? lastDate;
  } else {
    startText = get("start").trim();
    endText = get("end").trim();
    if (!/^\d{2}:\d{2}$/.test(startText)) errors.start = "Choose a start time.";
    if (!/^\d{2}:\d{2}$/.test(endText)) errors.end = "Choose an end time.";
    if (Object.keys(errors).length > 0) return { startsAt: null, endsAt: null, errors };
  }

  const starts = zonedWallTimeToInstant(date, startText, timeZone);
  const ends = zonedWallTimeToInstant(endDate, endText, timeZone);
  if (starts === null) errors[allDay ? "date" : "start"] = "That time does not exist on that day, because the clocks change.";
  if (ends === null) errors[allDay ? "endDate" : "end"] = "That time does not exist on that day, because the clocks change.";
  if (starts !== null && ends !== null && ends.getTime() <= starts.getTime()) errors.end = "The end must be after the start.";
  if (Object.keys(errors).length > 0 || starts === null || ends === null) return { startsAt: null, endsAt: null, errors };
  return { startsAt: starts.toISOString(), endsAt: ends.toISOString(), errors };
}
