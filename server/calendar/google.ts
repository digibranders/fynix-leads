import type { Interval } from "@/lib/calendar/free-time";
import { wallClockToInstant } from "@/lib/leads/host-hours";
import { CalendarAuthError, CalendarFaultError, DEFAULT_TIMEOUT_MS, MAX_PAGES, asArray, asString, formBody, isRecord, readTokenAnswer, type CalendarEvent, type CalendarProvider } from "@/server/calendar/provider";

/**
 * Google Calendar over `fetch`. One read path: `events.list` on the primary calendar with recurring events expanded (`singleEvents`), which answers busy time and
 * titles alike. Fixtures in the tests are written from Google's documentation, not recorded from a real account (gate G5 proves them).
 */
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
/** The narrowest scope that lists events with their details. Whether Google reviews it as sensitive is read from the console at gate G5. */
export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
const PAGE_SIZE = 250;
/** Event types that never make a person busy. An out-of-office event does. */
const NOT_BUSY_TYPES = new Set(["workingLocation", "birthday"]);

type GoogleEvent = Record<string, unknown>;

function whenOf(value: unknown, zone: string): { readonly at: Date; readonly allDay: boolean } | undefined {
  if (!isRecord(value)) return undefined;
  const dateTime = asString(value.dateTime);
  if (dateTime !== undefined) {
    const at = new Date(dateTime);
    return Number.isNaN(at.getTime()) ? undefined : { at, allDay: false };
  }
  const date = asString(value.date);
  if (date === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  // shortcut: an all-day event is read as midnight to midnight in the calendar's own zone, which Google reports at the top of the answer. Revisit if gate G5 shows otherwise.
  return { at: wallClockToInstant(date, 0, asString(value.timeZone) ?? zone), allDay: true };
}

/** One event as the portal reads it, or undefined when it makes nobody busy or cannot be read. Titles are kept only when asked for. */
export function parseGoogleEvent(raw: unknown, zone: string, withTitles: boolean): CalendarEvent | undefined {
  if (!isRecord(raw)) return undefined;
  const event: GoogleEvent = raw;
  const start = whenOf(event.start, zone);
  const end = whenOf(event.end, zone);
  if (start === undefined || end === undefined || end.at <= start.at) return undefined;
  const declined = asArray(event.attendees).some((attendee) => isRecord(attendee) && attendee.self === true && attendee.responseStatus === "declined");
  const eventType = asString(event.eventType) ?? "default";
  const busy = event.status !== "cancelled" && event.transparency !== "transparent" && !declined && !NOT_BUSY_TYPES.has(eventType);
  return { icalUid: asString(event.iCalUID) ?? null, start: start.at, end: end.at, busy, title: withTitles ? (asString(event.summary) ?? "Busy") : null, allDay: start.allDay };
}

/** The events of one page, and the token of the next page when there is one. */
export function parseGoogleEvents(body: unknown, withTitles: boolean): { readonly events: readonly CalendarEvent[]; readonly nextPageToken: string | null } {
  if (!isRecord(body)) return { events: [], nextPageToken: null };
  const zone = asString(body.timeZone) ?? "UTC";
  const events = asArray(body.items).flatMap((item) => {
    const parsed = parseGoogleEvent(item, zone, withTitles);
    return parsed === undefined ? [] : [parsed];
  });
  return { events, nextPageToken: asString(body.nextPageToken) ?? null };
}

export interface GoogleCalendarOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly timeoutMs?: number;
}

export function googleCalendarProvider(options: GoogleCalendarOptions): CalendarProvider {
  const send = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const call = (url: string, init: RequestInit) => send(url, { ...init, signal: AbortSignal.timeout(timeout), cache: "no-store" });
  const token = (fields: Record<string, string>) =>
    call(GOOGLE_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ client_id: options.clientId, client_secret: options.clientSecret, ...fields }) });

  return {
    name: "google",
    authorizationUrl: ({ state, challenge, redirectUri }) =>
      `${GOOGLE_AUTH_URL}?${new URLSearchParams({
        client_id: options.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: GOOGLE_SCOPE,
        // offline asks for a refresh token; consent makes Google issue one even when the person connected before.
        access_type: "offline",
        prompt: "consent",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      }).toString()}`,
    async exchangeCode({ code, verifier, redirectUri }) {
      const answer = await readTokenAnswer(await token({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier }), now());
      if (answer.refreshToken === null) throw new CalendarFaultError(200);
      return { ...answer, refreshToken: answer.refreshToken };
    },
    async refresh(refreshToken) {
      return readTokenAnswer(await token({ grant_type: "refresh_token", refresh_token: refreshToken }), now());
    },
    async listEvents(accessToken: string, range: Interval, { withTitles }) {
      const events: CalendarEvent[] = [];
      let pageToken: string | null = null;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const query = new URLSearchParams({ timeMin: range.start.toISOString(), timeMax: range.end.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: String(PAGE_SIZE) });
        if (pageToken !== null) query.set("pageToken", pageToken);
        const response = await call(`${GOOGLE_EVENTS_URL}?${query.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (response.status === 401) throw new CalendarAuthError();
        if (!response.ok) throw new CalendarFaultError(response.status);
        const parsed = parseGoogleEvents(await response.json(), withTitles);
        events.push(...parsed.events);
        if (parsed.nextPageToken === null) return events;
        pageToken = parsed.nextPageToken;
      }
      throw new CalendarFaultError(0);
    },
    async revoke(refreshToken) {
      await call(GOOGLE_REVOKE_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ token: refreshToken }) });
    },
  };
}
