import type { Interval } from "@/lib/calendar/free-time";

/**
 * Where a person's calendar events come from (calendar spec of 2026-11-26, section 8). One provider per account type, over plain `fetch`: no SDK. The portal
 * asks for one thing, the events of the primary calendar between two moments, and uses it twice: for busy time (titles dropped) and for showing a person their
 * own calendar (titles kept, never stored).
 */
export type CalendarProviderName = "google" | "microsoft";
export const CALENDAR_PROVIDERS: readonly CalendarProviderName[] = ["google", "microsoft"];

export interface CalendarEvent {
  /** The provider's id, used only to drop a portal meeting that came back from the calendar. */
  readonly icalUid: string | null;
  readonly start: Date;
  readonly end: Date;
  /** Marked busy, tentative or out of office, not cancelled, not declined by the person (spec 8.3). */
  readonly busy: boolean;
  /** Null unless the caller asked for titles. The sync never does. */
  readonly title: string | null;
  readonly allDay: boolean;
}

export interface TokenSet {
  readonly accessToken: string;
  /** Set when the provider issued a new refresh token (Microsoft always does). It replaces the stored one. */
  readonly refreshToken: string | null;
  readonly expiresAt: Date;
}

/** The provider refused the token or the grant: the person has to connect again. Any other failure is a fault that may pass. */
export class CalendarAuthError extends Error {
  constructor() {
    super("The calendar provider refused the connection");
    this.name = "CalendarAuthError";
  }
}

/** A fault that may pass (a timeout, a 5xx). The message carries a status and nothing of the response. */
export class CalendarFaultError extends Error {
  constructor(readonly status: number) {
    super(`The calendar provider answered ${status}`);
    this.name = "CalendarFaultError";
  }
}

export interface CalendarProvider {
  readonly name: CalendarProviderName;
  authorizationUrl(input: { readonly state: string; readonly challenge: string; readonly redirectUri: string }): string;
  /** Exchanges the code of the sign-in for tokens. A refresh token is always present on success; without one the call throws. */
  exchangeCode(input: { readonly code: string; readonly verifier: string; readonly redirectUri: string }): Promise<TokenSet & { readonly refreshToken: string }>;
  refresh(refreshToken: string): Promise<TokenSet>;
  listEvents(accessToken: string, range: Interval, options: { readonly withTitles: boolean }): Promise<readonly CalendarEvent[]>;
  /** Ends the grant at the provider where it allows that. A failure never stops a disconnect. */
  revoke(refreshToken: string): Promise<void>;
}

export const DEFAULT_TIMEOUT_MS = 10_000;
/** Most pages one read follows, so a runaway paging loop ends. At 250 or 100 events a page this is more than a 60 day window holds. */
export const MAX_PAGES = 20;

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
export const asArray = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
export const asString = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined);

/** A form body for the token calls. */
export const formBody = (fields: Readonly<Record<string, string>>): string => new URLSearchParams(fields).toString();

/** Reads an OAuth token answer. A 400 or 401 with `invalid_grant` (or 401 alone) is a refusal; the rest is a fault. Nothing of the body leaves this function. */
export async function readTokenAnswer(response: Response, now: Date): Promise<{ readonly accessToken: string; readonly refreshToken: string | null; readonly expiresAt: Date }> {
  if (response.status === 400 || response.status === 401) {
    const body: unknown = await response.json().catch(() => null);
    if (response.status === 401 || (isRecord(body) && body.error === "invalid_grant")) throw new CalendarAuthError();
    throw new CalendarFaultError(response.status);
  }
  if (!response.ok) throw new CalendarFaultError(response.status);
  const body: unknown = await response.json();
  if (!isRecord(body)) throw new CalendarFaultError(response.status);
  const accessToken = asString(body.access_token);
  const lifetime = typeof body.expires_in === "number" ? body.expires_in : 3600;
  if (accessToken === undefined) throw new CalendarFaultError(response.status);
  return { accessToken, refreshToken: asString(body.refresh_token) ?? null, expiresAt: new Date(now.getTime() + lifetime * 1000) };
}
