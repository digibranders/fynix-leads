import { describe, expect, it } from "vitest";
import { GOOGLE_TOKEN_URL, GoogleMeetError, MEET_API, googleMeetProvider, safeDisplayName } from "./google";
import { meetProviderFromEnv } from "./index";
import { createRoomSafely, noMeetProvider, type MeetProvider } from "./provider";

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A fake of Google: answers by URL, records every call. Nothing here touches the network. */
function fakeGoogle(routes: Record<string, (call: Call) => Response>): { readonly fetch: typeof fetch; readonly calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    fetch: async (input, init) => {
      const call = { url: String(input), init: init ?? {} };
      calls.push(call);
      const key = Object.keys(routes).find((prefix) => call.url.startsWith(prefix));
      if (key === undefined) return json(404, { error: { message: "no such route with an email victim@example.com" } });
      return (routes[key] as (call: Call) => Response)(call);
    },
  };
}
const CREDENTIALS = { clientId: "client-id-0123456789", clientSecret: "client-secret-0123456789", refreshToken: "refresh-token-0123456789" };
const token = () => json(200, { access_token: "access-token-abc", expires_in: 3599 });

describe("createRoom", () => {
  it("exchanges the refresh token, makes an OPEN space and returns its link and space", async () => {
    const google = fakeGoogle({ [GOOGLE_TOKEN_URL]: token, [`${MEET_API}/spaces`]: () => json(200, { name: "spaces/abc123", meetingUri: "https://meet.google.com/abc-defg-hij", meetingCode: "abc-defg-hij" }) });
    const room = await googleMeetProvider({ ...CREDENTIALS, fetch: google.fetch }).createRoom({ startsAt: new Date(), durationMinutes: 30 });
    expect(room).toEqual({ url: "https://meet.google.com/abc-defg-hij", spaceId: "spaces/abc123" });
    const [tokenCall, spaceCall] = google.calls;
    expect(tokenCall?.url).toBe(GOOGLE_TOKEN_URL);
    expect(String(tokenCall?.init.body)).toContain("grant_type=refresh_token");
    expect(spaceCall?.init.method).toBe("POST");
    expect((spaceCall?.init.headers as Record<string, string>).authorization).toBe("Bearer access-token-abc");
    expect(JSON.parse(String(spaceCall?.init.body))).toEqual({ config: { accessType: "OPEN" } });
  });

  it("reuses the access token until it is about to expire", async () => {
    let clock = new Date("2026-12-01T09:00:00.000Z");
    const google = fakeGoogle({ [GOOGLE_TOKEN_URL]: token, [`${MEET_API}/spaces`]: () => json(200, { name: "spaces/abc123", meetingUri: "https://meet.google.com/abc-defg-hij" }) });
    const provider = googleMeetProvider({ ...CREDENTIALS, fetch: google.fetch, now: () => clock });
    await provider.createRoom({ startsAt: new Date(), durationMinutes: 30 });
    await provider.createRoom({ startsAt: new Date(), durationMinutes: 30 });
    expect(google.calls.filter((call) => call.url === GOOGLE_TOKEN_URL)).toHaveLength(1);
    clock = new Date("2026-12-01T10:30:00.000Z");
    await provider.createRoom({ startsAt: new Date(), durationMinutes: 30 });
    expect(google.calls.filter((call) => call.url === GOOGLE_TOKEN_URL)).toHaveLength(2);
  });

  it.each([
    ["a link that is not on meet.google.com", { name: "spaces/abc123", meetingUri: "https://evil.example/abc" }],
    ["a space name that is not a space", { name: "../conferenceRecords", meetingUri: "https://meet.google.com/abc-defg-hij" }],
    ["no link", { name: "spaces/abc123" }],
  ])("refuses an answer with %s", async (_name, body) => {
    const google = fakeGoogle({ [GOOGLE_TOKEN_URL]: token, [`${MEET_API}/spaces`]: () => json(200, body) });
    await expect(googleMeetProvider({ ...CREDENTIALS, fetch: google.fetch }).createRoom({ startsAt: new Date(), durationMinutes: 30 })).rejects.toBeInstanceOf(GoogleMeetError);
  });

  it("throws an error that carries the status and nothing of the body", async () => {
    const google = fakeGoogle({ [GOOGLE_TOKEN_URL]: token, [`${MEET_API}/spaces`]: () => json(403, { error: { message: "victim@example.com may not" } }) });
    const error = await googleMeetProvider({ ...CREDENTIALS, fetch: google.fetch }).createRoom({ startsAt: new Date(), durationMinutes: 30 }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GoogleMeetError);
    expect(`${(error as Error).message} ${(error as Error).stack}`).not.toContain("victim");
    expect((error as GoogleMeetError).status).toBe(403);
  });
});

describe("readJoinRecord", () => {
  const record = (path: string): Response => {
    if (path.startsWith(`${MEET_API}/conferenceRecords?`)) return json(200, { conferenceRecords: [{ name: "conferenceRecords/rec1", space: "spaces/abc123" }] });
    if (path.startsWith(`${MEET_API}/conferenceRecords/rec1/participants?`)) {
      return json(200, {
        participants: [
          // A signed-in person: the account id and everything but the display name are ignored. Their name looks like an address, so it is replaced.
          { name: "conferenceRecords/rec1/participants/p1", earliestStartTime: "2026-12-08T14:31:00Z", latestEndTime: "2026-12-08T15:01:00Z", signedinUser: { user: "users/1234", displayName: "lena@brightpath.example", email: "lena@brightpath.example" } },
          { name: "conferenceRecords/rec1/participants/p2", earliestStartTime: "2026-12-08T14:29:00Z", latestEndTime: "2026-12-08T15:00:00Z", anonymousUser: { displayName: "Marta Lindqvist" } },
          { name: "conferenceRecords/rec1/participants/p3", earliestStartTime: "2026-12-08T14:40:00Z", phoneUser: { displayName: "" } },
        ],
      });
    }
    if (path.includes("/participants/p1/participantSessions")) return json(200, { participantSessions: [{ startTime: "2026-12-08T14:31:00Z", endTime: "2026-12-08T14:46:00Z" }, { startTime: "2026-12-08T14:50:00Z", endTime: "2026-12-08T15:01:00Z" }] });
    if (path.includes("/participants/p2/participantSessions")) return json(200, { participantSessions: [{ startTime: "2026-12-08T14:29:00Z", endTime: "2026-12-08T15:00:00Z" }] });
    return json(200, {});
  };

  it("lists everyone with name, join time, leave time and the summed length of their sessions, and never an address or an account id", async () => {
    const google = fakeGoogle({ [GOOGLE_TOKEN_URL]: token, [MEET_API]: (call) => record(call.url) });
    const entries = await googleMeetProvider({ ...CREDENTIALS, fetch: google.fetch }).readJoinRecord("spaces/abc123");
    expect(entries).toEqual([
      { displayName: "Marta Lindqvist", joinedAt: new Date("2026-12-08T14:29:00Z"), leftAt: new Date("2026-12-08T15:00:00Z"), durationSeconds: 1860 },
      { displayName: "Guest", joinedAt: new Date("2026-12-08T14:31:00Z"), leftAt: new Date("2026-12-08T15:01:00Z"), durationSeconds: 15 * 60 + 11 * 60 },
      { displayName: "Guest", joinedAt: new Date("2026-12-08T14:40:00Z"), leftAt: null, durationSeconds: 0 },
    ]);
    const everything = JSON.stringify(entries);
    expect(everything).not.toMatch(/@|users\/1234|brightpath/);
    // The filter names the space in the form the API documents.
    expect(decodeURIComponent(google.calls.find((call) => call.url.includes("conferenceRecords?"))?.url ?? "")).toContain('filter=space.name="spaces/abc123"');
  });

  it("follows the next page of a long list", async () => {
    const google = fakeGoogle({
      [GOOGLE_TOKEN_URL]: token,
      [`${MEET_API}/conferenceRecords?`]: () => json(200, { conferenceRecords: [{ name: "conferenceRecords/rec1" }] }),
      [`${MEET_API}/conferenceRecords/rec1/participants?`]: (call) =>
        call.url.includes("pageToken=next1")
          ? json(200, { participants: [{ name: "conferenceRecords/rec1/participants/p2", earliestStartTime: "2026-12-08T14:30:00Z", anonymousUser: { displayName: "Second" } }] })
          : json(200, { participants: [{ name: "conferenceRecords/rec1/participants/p1", earliestStartTime: "2026-12-08T14:29:00Z", anonymousUser: { displayName: "First" } }], nextPageToken: "next1" }),
      [`${MEET_API}/conferenceRecords/rec1/participants/`]: () => json(200, {}),
    });
    const entries = await googleMeetProvider({ ...CREDENTIALS, fetch: google.fetch }).readJoinRecord("spaces/abc123");
    expect(entries.map((entry) => entry.displayName)).toEqual(["First", "Second"]);
  });

  it("refuses a space name that is not one, before any request", async () => {
    const google = fakeGoogle({});
    await expect(googleMeetProvider({ ...CREDENTIALS, fetch: google.fetch }).readJoinRecord("spaces/abc/../x")).rejects.toBeInstanceOf(GoogleMeetError);
    expect(google.calls).toHaveLength(0);
  });

  it("throws when Google cannot be read, so the import is tried again", async () => {
    const google = fakeGoogle({ [GOOGLE_TOKEN_URL]: token, [MEET_API]: () => json(503, {}) });
    await expect(googleMeetProvider({ ...CREDENTIALS, fetch: google.fetch }).readJoinRecord("spaces/abc123")).rejects.toBeInstanceOf(GoogleMeetError);
  });
});

describe("safeDisplayName", () => {
  it.each([
    ["Marta Lindqvist", "Marta Lindqvist"],
    ["  Marta  ", "Marta"],
    ["marta@example.com", "Guest"],
    ["", "Guest"],
    [undefined, "Guest"],
    [42, "Guest"],
  ])("%j becomes %j", (input, expected) => {
    expect(safeDisplayName(input)).toBe(expected);
  });
});

describe("the provider the environment names", () => {
  it("is no provider by default, and a room is not made", async () => {
    for (const source of [{}, { MEET_PROVIDER: "" }, { MEET_PROVIDER: "none" }]) {
      const provider = meetProviderFromEnv(source);
      expect(provider).toBe(noMeetProvider);
      expect(await provider.createRoom({ startsAt: new Date(), durationMinutes: 30 })).toBeNull();
      expect(await provider.readJoinRecord("spaces/abc123")).toEqual([]);
    }
  });

  it("refuses google without its three variables, naming the one missing, and any other name", () => {
    expect(() => meetProviderFromEnv({ MEET_PROVIDER: "google", GOOGLE_MEET_CLIENT_ID: "x" })).toThrow("GOOGLE_MEET_CLIENT_SECRET");
    expect(() => meetProviderFromEnv({ MEET_PROVIDER: "zoom" })).toThrow();
    expect(typeof meetProviderFromEnv({ MEET_PROVIDER: "google", ...{ GOOGLE_MEET_CLIENT_ID: "a", GOOGLE_MEET_CLIENT_SECRET: "b", GOOGLE_MEET_REFRESH_TOKEN: "c" } }).createRoom).toBe("function");
  });
});

describe("createRoomSafely", () => {
  const meeting = { startsAt: new Date(), durationMinutes: 30 };
  it("answers null for no provider and for a provider that fails, without throwing and without logging the message", async () => {
    expect(await createRoomSafely(undefined, meeting)).toBeNull();
    const failing: MeetProvider = { createRoom: async () => Promise.reject(new GoogleMeetError(500)), readJoinRecord: async () => [] };
    const logged: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void logged.push(args.join(" "));
    try {
      expect(await createRoomSafely(failing, meeting)).toBeNull();
    } finally {
      console.error = original;
    }
    expect(logged).toEqual(["A meeting room could not be created (GoogleMeetError)."]);
  });

  it("passes a room through", async () => {
    const room = { url: "https://meet.google.com/abc-defg-hij", spaceId: "spaces/abc123" };
    expect(await createRoomSafely({ createRoom: async () => room, readJoinRecord: async () => [] }, meeting)).toEqual(room);
  });
});
