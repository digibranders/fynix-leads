import { describe, expect, it, vi } from "vitest";
import { GOOGLE_AUTH_URL, GOOGLE_SCOPE, googleCalendarProvider, parseGoogleEvent, parseGoogleEvents } from "./google";
import { CalendarAuthError, CalendarFaultError } from "./provider";

// Fixtures written from Google's documentation for events.list, not recorded from a real account. Gate G5 proves them.
const timed = { iCalUID: "a@google.com", status: "confirmed", summary: "Salary review with Dana", start: { dateTime: "2026-12-03T10:00:00+01:00" }, end: { dateTime: "2026-12-03T11:00:00+01:00" } };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const provider = (fetchMock: typeof fetch) => googleCalendarProvider({ clientId: "client-id-123", clientSecret: "client-secret-123", fetch: fetchMock, now: () => new Date("2026-12-01T10:00:00Z") });

describe("which Google events make someone busy", () => {
  it("counts a confirmed event, a tentative one and an out of office one", () => {
    expect(parseGoogleEvent(timed, "UTC", false)?.busy).toBe(true);
    expect(parseGoogleEvent({ ...timed, status: "tentative" }, "UTC", false)?.busy).toBe(true);
    expect(parseGoogleEvent({ ...timed, eventType: "outOfOffice" }, "UTC", false)?.busy).toBe(true);
  });
  it("does not count an event marked free, a cancelled one, one the person declined, a working location or a birthday", () => {
    expect(parseGoogleEvent({ ...timed, transparency: "transparent" }, "UTC", false)?.busy).toBe(false);
    expect(parseGoogleEvent({ ...timed, status: "cancelled" }, "UTC", false)?.busy).toBe(false);
    expect(parseGoogleEvent({ ...timed, attendees: [{ self: true, responseStatus: "declined" }] }, "UTC", false)?.busy).toBe(false);
    expect(parseGoogleEvent({ ...timed, attendees: [{ self: false, responseStatus: "declined" }] }, "UTC", false)?.busy).toBe(true);
    expect(parseGoogleEvent({ ...timed, eventType: "workingLocation" }, "UTC", false)?.busy).toBe(false);
    expect(parseGoogleEvent({ ...timed, eventType: "birthday" }, "UTC", false)?.busy).toBe(false);
  });
  it("reads the offset in a time, and an all day event as midnight to midnight in the calendar's zone", () => {
    expect(parseGoogleEvent(timed, "UTC", false)?.start.toISOString()).toBe("2026-12-03T09:00:00.000Z");
    const allDay = parseGoogleEvent({ status: "confirmed", start: { date: "2026-12-03" }, end: { date: "2026-12-04" } }, "Asia/Kolkata", false);
    expect(allDay?.allDay).toBe(true);
    expect(allDay?.start.toISOString()).toBe("2026-12-02T18:30:00.000Z");
    expect(allDay?.end.toISOString()).toBe("2026-12-03T18:30:00.000Z");
  });
  it("drops what cannot be read", () => {
    expect(parseGoogleEvent({ start: { dateTime: "nonsense" }, end: { dateTime: "2026-12-03T11:00:00Z" } }, "UTC", false)).toBeUndefined();
    expect(parseGoogleEvent({ start: { dateTime: "2026-12-03T11:00:00Z" }, end: { dateTime: "2026-12-03T10:00:00Z" } }, "UTC", false)).toBeUndefined();
    expect(parseGoogleEvent("text", "UTC", false)).toBeUndefined();
  });
});

describe("titles", () => {
  it("are dropped unless asked for, inside the parser", () => {
    expect(parseGoogleEvent(timed, "UTC", false)?.title).toBeNull();
    expect(JSON.stringify(parseGoogleEvents({ items: [timed] }, false))).not.toContain("Salary");
    expect(parseGoogleEvent(timed, "UTC", true)?.title).toBe("Salary review with Dana");
    expect(parseGoogleEvent({ ...timed, summary: undefined }, "UTC", true)?.title).toBe("Busy");
  });
});

describe("the Google provider", () => {
  it("builds a sign-in address with offline access, consent, the narrow scope and a PKCE challenge", () => {
    const url = new URL(provider(vi.fn() as unknown as typeof fetch).authorizationUrl({ state: "s".repeat(22), challenge: "c".repeat(43), redirectUri: "https://leads.example/api/calendar/callback/google" }));
    expect(url.origin + url.pathname).toBe(GOOGLE_AUTH_URL);
    expect(url.searchParams.get("scope")).toBe(GOOGLE_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe("https://leads.example/api/calendar/callback/google");
  });
  it("exchanges a code with the verifier and keeps the refresh token; an answer with none is a fault", async () => {
    const calls: string[] = [];
    const ok = provider((async (_url: string, init: RequestInit) => { calls.push(String(init.body)); return json({ access_token: "at", refresh_token: "rt", expires_in: 3599 }); }) as unknown as typeof fetch);
    const tokens = await ok.exchangeCode({ code: "the-code", verifier: "v".repeat(43), redirectUri: "https://x/cb" });
    expect(tokens).toMatchObject({ accessToken: "at", refreshToken: "rt" });
    expect(calls[0]).toContain("code_verifier=");
    expect(calls[0]).toContain("grant_type=authorization_code");
    const none = provider((async () => json({ access_token: "at", expires_in: 3599 })) as unknown as typeof fetch);
    await expect(none.exchangeCode({ code: "c", verifier: "v".repeat(43), redirectUri: "https://x/cb" })).rejects.toBeInstanceOf(CalendarFaultError);
  });
  it("treats invalid_grant on a refresh as a refusal and a server error as a fault, naming no body", async () => {
    const refused = provider((async () => json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400)) as unknown as typeof fetch);
    await expect(refused.refresh("rt")).rejects.toBeInstanceOf(CalendarAuthError);
    const broken = provider((async () => json({ error: "backend_error" }, 503)) as unknown as typeof fetch);
    const error = await broken.refresh("rt").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CalendarFaultError);
    expect((error as Error).message).toBe("The calendar provider answered 503");
  });
  it("follows the paging and sends the access token as a bearer, never in the address", async () => {
    const urls: string[] = [];
    const headers: string[] = [];
    const pages = [{ timeZone: "UTC", items: [timed], nextPageToken: "page-2" }, { timeZone: "UTC", items: [{ ...timed, start: { dateTime: "2026-12-04T10:00:00Z" }, end: { dateTime: "2026-12-04T11:00:00Z" } }] }];
    const reader = provider((async (url: string, init: RequestInit) => { urls.push(url); headers.push(String((init.headers as Record<string, string>).Authorization)); return json(pages[urls.length - 1]); }) as unknown as typeof fetch);
    const events = await reader.listEvents("access-token-xyz", { start: new Date("2026-12-01T00:00:00Z"), end: new Date("2026-12-31T00:00:00Z") }, { withTitles: false });
    expect(events).toHaveLength(2);
    expect(urls[0]).toContain("singleEvents=true");
    expect(urls[1]).toContain("pageToken=page-2");
    expect(urls.join("")).not.toContain("access-token-xyz");
    expect(headers[0]).toBe("Bearer access-token-xyz");
  });
  it("treats a 401 on a read as a refusal and stops a paging loop that never ends", async () => {
    const range = { start: new Date("2026-12-01T00:00:00Z"), end: new Date("2026-12-31T00:00:00Z") };
    await expect(provider((async () => json({}, 401)) as unknown as typeof fetch).listEvents("t", range, { withTitles: false })).rejects.toBeInstanceOf(CalendarAuthError);
    await expect(provider((async () => json({ items: [], nextPageToken: "again" })) as unknown as typeof fetch).listEvents("t", range, { withTitles: false })).rejects.toBeInstanceOf(CalendarFaultError);
  });
});
