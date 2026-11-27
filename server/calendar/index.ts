import { tokenKey } from "@/server/calendar/crypto";
import { googleCalendarProvider } from "@/server/calendar/google";
import { microsoftCalendarProvider } from "@/server/calendar/microsoft";
import type { CalendarProvider, CalendarProviderName } from "@/server/calendar/provider";

type Source = Readonly<Record<string, string | undefined>>;

/** Whether calendar connection is on: the exact word `true`. Off by default, and then nothing here ever calls anyone. */
export const calendarSyncEnabled = (source: Source = process.env): boolean => source.CALENDAR_SYNC_ENABLED === "true";

export interface CalendarSetup {
  /** The encryption and signing key. */
  readonly key: Buffer;
  /** The providers that have a client id and secret. */
  readonly providers: Readonly<Partial<Record<CalendarProviderName, CalendarProvider>>>;
}

/**
 * The calendar set-up the environment names, or null while the switch is off. With it on, a missing key throws naming the variable (the environment check
 * already insists on it), and a provider without both its id and secret is left out so its Connect button does not appear.
 */
export function calendarSetupFromEnv(source: Source = process.env): CalendarSetup | null {
  if (!calendarSyncEnabled(source)) return null;
  const providers: Partial<Record<CalendarProviderName, CalendarProvider>> = {};
  const googleId = source.GOOGLE_CALENDAR_CLIENT_ID;
  const googleSecret = source.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (googleId !== undefined && googleId !== "" && googleSecret !== undefined && googleSecret !== "") providers.google = googleCalendarProvider({ clientId: googleId, clientSecret: googleSecret });
  const microsoftId = source.MICROSOFT_CALENDAR_CLIENT_ID;
  const microsoftSecret = source.MICROSOFT_CALENDAR_CLIENT_SECRET;
  if (microsoftId !== undefined && microsoftId !== "" && microsoftSecret !== undefined && microsoftSecret !== "") providers.microsoft = microsoftCalendarProvider({ clientId: microsoftId, clientSecret: microsoftSecret });
  return { key: tokenKey(source.CALENDAR_TOKEN_KEY), providers };
}
