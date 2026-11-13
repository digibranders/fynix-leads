/** The campaign settings that have rules of their own: the time zone (which counting uses) and the default meeting length. */
export const DEFAULT_CAMPAIGN_TIME_ZONE = "Europe/London";
export const DEFAULT_MEETING_MINUTES = 30;
export const MEETING_MINUTES_MIN = 15;
export const MEETING_MINUTES_MAX = 240;

/** A region name with optional city parts (`Europe/London`, `America/Argentina/Buenos_Aires`) or a single name (`UTC`). Offsets such as `+01:00` do not match. */
const ZONE_SHAPE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;

/**
 * True when `value` names a time zone the runtime knows. The shape check comes first because newer ICU versions also accept
 * numeric offsets in `Intl.DateTimeFormat`, and an offset is not a zone: it has no daylight saving rules, so a campaign
 * counted in it would drift twice a year. The database cannot do this check (`AT TIME ZONE` is not immutable), so the domain does.
 */
export function isIanaTimeZone(value: string): boolean {
  if (value.length === 0 || value.length > 64 || !ZONE_SHAPE.test(value)) return false;
  try {
    Intl.DateTimeFormat("en-GB", { timeZone: value }).resolvedOptions();
    return true;
  } catch {
    return false;
  }
}
