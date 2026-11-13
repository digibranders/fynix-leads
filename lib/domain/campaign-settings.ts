/** The campaign settings that have rules of their own: the time zone (which counting uses) and the default meeting length. */
export const DEFAULT_CAMPAIGN_TIME_ZONE = "Europe/London";
export const DEFAULT_MEETING_MINUTES = 30;
export const MEETING_MINUTES_MIN = 15;
export const MEETING_MINUTES_MAX = 240;

/**
 * The names this runtime's `Intl.supportedValuesOf("timeZone")` lists, plus `UTC` (which it leaves out). Matching is exact, so
 * `EST`, `Etc/GMT+5` and `europe/london` are refused. ICU lists some zones under their former names (`Asia/Calcutta`), so the
 * current spellings that people type are added by hand; they are checked against the runtime below, never trusted blindly.
 */
// shortcut: this list is hand-written, so a current name missing from it is refused; add it here when a real zone is turned away.
const CURRENT_NAMES_LISTED_UNDER_OLD_ONES = [
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Asia/Yangon",
  "Asia/Ho_Chi_Minh",
  "Europe/Kyiv",
  "America/Nuuk",
  "Atlantic/Faroe",
  "Pacific/Kanton",
  "Africa/Asmara",
  "America/Argentina/Buenos_Aires",
  "America/Argentina/Catamarca",
  "America/Argentina/Cordoba",
  "America/Argentina/Jujuy",
  "America/Argentina/Mendoza",
  "America/Indiana/Indianapolis",
  "America/Kentucky/Louisville",
] as const;
const KNOWN_ZONES: ReadonlySet<string> = new Set<string>(["UTC", ...Intl.supportedValuesOf("timeZone"), ...CURRENT_NAMES_LISTED_UNDER_OLD_ONES]);

/** True when `value` is exactly the canonical name of a time zone the runtime knows. A fixed offset is not a zone: it has no daylight saving rules, so a campaign counted in it would drift twice a year. The database cannot do this check (`AT TIME ZONE` is not immutable), so the domain does. */
export function isIanaTimeZone(value: string): boolean {
  if (!KNOWN_ZONES.has(value)) return false;
  try {
    Intl.DateTimeFormat("en-GB", { timeZone: value }).resolvedOptions();
    return true;
  } catch {
    return false;
  }
}
