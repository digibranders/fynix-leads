import type { Interval } from "@/lib/calendar/free-time";
import { CalendarAuthError, type CalendarEvent, type CalendarProvider, type CalendarProviderName, type TokenSet } from "@/server/calendar/provider";

/**
 * A provider for tests and for running the screens with no account: it answers from what it was given and calls nobody. A refresh token listed in `refused` is
 * treated as revoked, and one in `failing` as a fault that may pass.
 */
export interface FakeCalendarOptions {
  readonly name?: CalendarProviderName;
  /** The events by refresh token. */
  readonly events?: Readonly<Record<string, readonly CalendarEvent[]>>;
  readonly refused?: ReadonlySet<string>;
  readonly failing?: ReadonlySet<string>;
  /** A refresh answers with a new refresh token, as Microsoft does. */
  readonly rotates?: boolean;
  readonly now?: () => Date;
}

export interface FakeCalendarProvider extends CalendarProvider {
  /** The refresh tokens the provider was asked to refresh, and to revoke, in order. */
  readonly refreshed: string[];
  readonly revoked: string[];
  /** The `withTitles` flag of each read. */
  readonly reads: boolean[];
}

export function fakeCalendarProvider(options: FakeCalendarOptions = {}): FakeCalendarProvider {
  const now = options.now ?? (() => new Date());
  const refreshed: string[] = [];
  const revoked: string[] = [];
  const reads: boolean[] = [];
  const tokens = (refresh: string): TokenSet => ({ accessToken: `access-of-${refresh}`, refreshToken: options.rotates === true ? `${refresh}+` : null, expiresAt: new Date(now().getTime() + 3_600_000) });
  return {
    name: options.name ?? "google",
    refreshed,
    revoked,
    reads,
    authorizationUrl: ({ state }) => `https://calendar.example/authorize?state=${state}`,
    exchangeCode: async ({ code }) => ({ accessToken: `access-of-${code}`, refreshToken: `refresh-of-${code}`, expiresAt: new Date(now().getTime() + 3_600_000) }),
    refresh: async (refreshToken) => {
      refreshed.push(refreshToken);
      if (options.refused?.has(refreshToken) === true) throw new CalendarAuthError();
      if (options.failing?.has(refreshToken) === true) throw new Error("fault");
      return tokens(refreshToken);
    },
    listEvents: async (accessToken, range: Interval, { withTitles }) => {
      reads.push(withTitles);
      const events = options.events?.[accessToken.replace(/^access-of-/, "")] ?? [];
      return events.filter((event) => event.start < range.end && event.end > range.start).map((event) => (withTitles ? event : { ...event, title: null }));
    },
    revoke: async (refreshToken) => {
      revoked.push(refreshToken);
    },
  };
}
