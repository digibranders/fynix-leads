import { isMeetUrl } from "@/lib/email/launch-templates";
import type { JoinEntry, MeetProvider, MeetRoom } from "@/server/meet/provider";

/**
 * Google Meet through its REST API v2, with `fetch` and no SDK. One neutral Workspace account owns every room: its OAuth refresh token (obtained once by the
 * owner, step 5 of "What the owner arranges") is exchanged for a short access token. Rooms are made with `accessType: OPEN`, so a guest joins without knocking.
 * The join record is read from `conferenceRecords`, their `participants` and each participant's `participantSessions`.
 *
 * What is kept from a participant is the display name, the earliest start, the latest end and the summed length of the sessions. The API also reports who is
 * signed in (an account id) and, for a person signed in, nothing else of use: none of it is read. A display name that looks like an email address is replaced
 * by "Guest", so an address typed as a name never reaches the join record. An error carries the status code and nothing of the body.
 */
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const MEET_API = "https://meet.googleapis.com/v2";
const DEFAULT_TIMEOUT_MS = 10_000;
const PAGE_SIZE = 250;
const SPACE_NAME = /^spaces\/[A-Za-z0-9_-]{1,64}$/;

export interface GoogleMeetOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly timeoutMs?: number;
}

export class GoogleMeetError extends Error {
  constructor(readonly status: number) {
    super(`Google Meet answered ${status}`);
    this.name = "GoogleMeetError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const asArray = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
const asString = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined);

function asDate(value: unknown): Date | undefined {
  const text = asString(value);
  if (text === undefined) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** The name as it appeared in the room, kept short, or "Guest" when there is none or it looks like an address. */
export function safeDisplayName(value: unknown): string {
  const name = asString(value)?.trim() ?? "";
  if (name === "" || name.includes("@")) return "Guest";
  return name.length > 120 ? name.slice(0, 120) : name;
}

export function googleMeetProvider(options: GoogleMeetOptions): MeetProvider {
  const send = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let token: { readonly value: string; readonly expiresAt: number } | undefined;

  async function accessToken(): Promise<string> {
    if (token !== undefined && token.expiresAt > now().getTime() + 60_000) return token.value;
    const response = await send(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: options.clientId, client_secret: options.clientSecret, refresh_token: options.refreshToken, grant_type: "refresh_token" }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) throw new GoogleMeetError(response.status);
    const body: unknown = await response.json().catch(() => null);
    const value = isRecord(body) ? asString(body.access_token) : undefined;
    if (value === undefined) throw new GoogleMeetError(502);
    const seconds = isRecord(body) && typeof body.expires_in === "number" ? body.expires_in : 3000;
    token = { value, expiresAt: now().getTime() + seconds * 1000 };
    return value;
  }

  async function call(path: string, init: { readonly method?: "GET" | "POST"; readonly body?: unknown } = {}): Promise<Record<string, unknown>> {
    const response = await send(`${MEET_API}/${path}`, {
      method: init.method ?? "GET",
      headers: { authorization: `Bearer ${await accessToken()}`, ...(init.body === undefined ? {} : { "content-type": "application/json" }) },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) throw new GoogleMeetError(response.status);
    const body: unknown = await response.json().catch(() => null);
    return isRecord(body) ? body : {};
  }

  /** Every item of a paged list, following `nextPageToken`, at most ten pages. */
  async function listAll(path: string, key: string, query: string): Promise<readonly Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const separator = query === "" ? "" : "&";
      const body = await call(`${path}?${query}${separator}pageSize=${PAGE_SIZE}${pageToken === undefined ? "" : `&pageToken=${encodeURIComponent(pageToken)}`}`);
      for (const item of asArray(body[key])) if (isRecord(item)) items.push(item);
      pageToken = asString(body.nextPageToken);
      if (pageToken === undefined) break;
    }
    return items;
  }

  return {
    async createRoom(): Promise<MeetRoom> {
      const body = await call("spaces", { method: "POST", body: { config: { accessType: "OPEN" } } });
      const spaceId = asString(body.name);
      const url = asString(body.meetingUri);
      if (spaceId === undefined || url === undefined || !SPACE_NAME.test(spaceId) || !isMeetUrl(url)) throw new GoogleMeetError(502);
      return { url, spaceId };
    },

    async readJoinRecord(spaceId: string): Promise<readonly JoinEntry[]> {
      if (!SPACE_NAME.test(spaceId)) throw new GoogleMeetError(400);
      const records = await listAll("conferenceRecords", "conferenceRecords", `filter=${encodeURIComponent(`space.name="${spaceId}"`)}`);
      const entries: JoinEntry[] = [];
      for (const record of records) {
        const recordName = asString(record.name);
        if (recordName === undefined || !/^conferenceRecords\/[A-Za-z0-9_-]{1,100}$/.test(recordName)) continue;
        for (const participant of await listAll(`${recordName}/participants`, "participants", "")) {
          const participantName = asString(participant.name);
          if (participantName === undefined || !/^conferenceRecords\/[A-Za-z0-9_-]{1,100}\/participants\/[A-Za-z0-9_-]{1,100}$/.test(participantName)) continue;
          // Whichever kind of participant it is, only the display name is taken from it.
          const kind = [participant.signedinUser, participant.anonymousUser, participant.phoneUser].find(isRecord);
          const displayName = safeDisplayName(kind?.displayName);
          let joinedAt = asDate(participant.earliestStartTime);
          let leftAt = asDate(participant.latestEndTime) ?? null;
          let seconds = 0;
          for (const session of await listAll(`${participantName}/participantSessions`, "participantSessions", "")) {
            const start = asDate(session.startTime);
            const end = asDate(session.endTime);
            if (start === undefined) continue;
            if (joinedAt === undefined || start < joinedAt) joinedAt = start;
            if (end !== undefined) {
              seconds += Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
              if (leftAt === null || end > leftAt) leftAt = end;
            }
          }
          if (joinedAt === undefined) continue;
          entries.push({ displayName, joinedAt, leftAt, durationSeconds: seconds });
        }
      }
      return entries.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
    },
  };
}
