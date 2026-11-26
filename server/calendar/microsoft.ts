import type { Interval } from "@/lib/calendar/free-time";
import { CalendarAuthError, CalendarFaultError, DEFAULT_TIMEOUT_MS, MAX_PAGES, asArray, asString, formBody, isRecord, readTokenAnswer, type CalendarEvent, type CalendarProvider } from "@/server/calendar/provider";

/**
 * Microsoft 365 and Outlook.com through Microsoft Graph, over `fetch`. One read path: the calendar view of the signed-in person's default calendar, which expands
 * recurring events. The `common` tenant accepts work, school and personal accounts; whether one app registration serves all three is proved at gate G5. Fixtures in
 * the tests are written from Microsoft's documentation, not recorded from a real account.
 */
export const MICROSOFT_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
export const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
export const GRAPH_ORIGIN = "https://graph.microsoft.com";
export const GRAPH_VIEW_URL = `${GRAPH_ORIGIN}/v1.0/me/calendarView`;
/** `Calendars.Read` shows titles and times; `offline_access` is what makes Microsoft issue a refresh token. */
export const MICROSOFT_SCOPE = "offline_access Calendars.Read";
const PAGE_SIZE = 100;
/** Marks that make a person busy. `free`, `workingElsewhere` and `unknown` do not. */
const BUSY_MARKS = new Set(["busy", "tentative", "oof"]);

/** Graph returns times as "2026-12-03T10:00:00.0000000" in the zone asked for with the Prefer header, and the portal asks for UTC, so the text is UTC with no offset. */
function utc(value: unknown): Date | undefined {
  if (!isRecord(value)) return undefined;
  const text = asString(value.dateTime);
  if (text === undefined) return undefined;
  const at = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text.slice(0, 23)}Z`);
  return Number.isNaN(at.getTime()) ? undefined : at;
}

/** One event as the portal reads it, or undefined when it cannot be read. Titles are kept only when asked for. */
export function parseGraphEvent(raw: unknown, withTitles: boolean): CalendarEvent | undefined {
  if (!isRecord(raw)) return undefined;
  const start = utc(raw.start);
  const end = utc(raw.end);
  if (start === undefined || end === undefined || end <= start) return undefined;
  const declined = isRecord(raw.responseStatus) && raw.responseStatus.response === "declined";
  const busy = raw.isCancelled !== true && !declined && BUSY_MARKS.has(asString(raw.showAs) ?? "busy");
  // shortcut: an all-day event comes back as midnight to midnight UTC because the portal asks for UTC, so for a person far from UTC it is shifted by their offset. Revisit at gate G5.
  return { icalUid: asString(raw.iCalUId) ?? null, start, end, busy, title: withTitles ? (asString(raw.subject) ?? "Busy") : null, allDay: raw.isAllDay === true };
}

export function parseGraphEvents(body: unknown, withTitles: boolean): { readonly events: readonly CalendarEvent[]; readonly nextLink: string | null } {
  if (!isRecord(body)) return { events: [], nextLink: null };
  const events = asArray(body.value).flatMap((item) => {
    const parsed = parseGraphEvent(item, withTitles);
    return parsed === undefined ? [] : [parsed];
  });
  const next = asString(body["@odata.nextLink"]);
  // A next link must stay on Graph: the access token is sent with it.
  return { events, nextLink: next !== undefined && next.startsWith(`${GRAPH_ORIGIN}/`) ? next : null };
}

export interface MicrosoftCalendarOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly timeoutMs?: number;
}

export function microsoftCalendarProvider(options: MicrosoftCalendarOptions): CalendarProvider {
  const send = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const call = (url: string, init: RequestInit) => send(url, { ...init, signal: AbortSignal.timeout(timeout), cache: "no-store" });
  const token = (fields: Record<string, string>) =>
    call(MICROSOFT_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ client_id: options.clientId, client_secret: options.clientSecret, scope: MICROSOFT_SCOPE, ...fields }) });

  return {
    name: "microsoft",
    authorizationUrl: ({ state, challenge, redirectUri }) =>
      `${MICROSOFT_AUTH_URL}?${new URLSearchParams({
        client_id: options.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        response_mode: "query",
        scope: MICROSOFT_SCOPE,
        prompt: "select_account",
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
      // Microsoft issues a new refresh token with every refresh, and the old one is to be discarded: the caller stores the one returned.
      return readTokenAnswer(await token({ grant_type: "refresh_token", refresh_token: refreshToken }), now());
    },
    async listEvents(accessToken: string, range: Interval, { withTitles }) {
      const events: CalendarEvent[] = [];
      const select = ["iCalUId", "start", "end", "showAs", "isCancelled", "isAllDay", "responseStatus", ...(withTitles ? ["subject"] : [])].join(",");
      let url: string | null = `${GRAPH_VIEW_URL}?${new URLSearchParams({ startDateTime: range.start.toISOString(), endDateTime: range.end.toISOString(), $select: select, $top: String(PAGE_SIZE) }).toString()}`;
      for (let page = 0; page < MAX_PAGES && url !== null; page += 1) {
        const response: Response = await call(url, { headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' } });
        if (response.status === 401) throw new CalendarAuthError();
        if (!response.ok) throw new CalendarFaultError(response.status);
        const parsed = parseGraphEvents(await response.json(), withTitles);
        events.push(...parsed.events);
        if (parsed.nextLink === null) return events;
        url = parsed.nextLink;
      }
      throw new CalendarFaultError(0);
    },
    // Microsoft documents no revoke call for these tokens: the person removes the app in their own account settings, and the portal forgets the token.
    revoke: async () => undefined,
  };
}
