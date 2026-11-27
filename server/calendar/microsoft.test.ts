import { describe, expect, it, vi } from "vitest";
import { GRAPH_VIEW_URL, MICROSOFT_AUTH_URL, MICROSOFT_SCOPE, microsoftCalendarProvider, parseGraphEvent, parseGraphEvents } from "./microsoft";
import { CalendarAuthError } from "./provider";

// Fixtures written from Microsoft's documentation for calendarView, not recorded from a real account. Gate G5 proves them.
const busy = { iCalUId: "m@outlook.com", subject: "Dentist", showAs: "busy", isCancelled: false, isAllDay: false, responseStatus: { response: "organizer" }, start: { dateTime: "2026-12-03T10:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2026-12-03T11:00:00.0000000", timeZone: "UTC" } };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const provider = (fetchMock: typeof fetch) => microsoftCalendarProvider({ clientId: "client-id-123", clientSecret: "client-secret-123", fetch: fetchMock, now: () => new Date("2026-12-01T10:00:00Z") });

describe("which Microsoft events make someone busy", () => {
  it("counts busy, tentative and out of office", () => {
    for (const showAs of ["busy", "tentative", "oof"]) expect(parseGraphEvent({ ...busy, showAs }, false)?.busy, showAs).toBe(true);
  });
  it("does not count free, working elsewhere, unknown, cancelled or declined", () => {
    for (const showAs of ["free", "workingElsewhere", "unknown"]) expect(parseGraphEvent({ ...busy, showAs }, false)?.busy, showAs).toBe(false);
    expect(parseGraphEvent({ ...busy, isCancelled: true }, false)?.busy).toBe(false);
    expect(parseGraphEvent({ ...busy, responseStatus: { response: "declined" } }, false)?.busy).toBe(false);
  });
  it("reads a time with no offset as UTC, since the portal asks for UTC", () => {
    expect(parseGraphEvent(busy, false)?.start.toISOString()).toBe("2026-12-03T10:00:00.000Z");
    expect(parseGraphEvent(busy, false)?.end.toISOString()).toBe("2026-12-03T11:00:00.000Z");
    expect(parseGraphEvent({ ...busy, start: { dateTime: "nonsense" } }, false)).toBeUndefined();
  });
  it("drops titles unless asked for, inside the parser", () => {
    expect(JSON.stringify(parseGraphEvents({ value: [busy] }, false))).not.toContain("Dentist");
    expect(parseGraphEvent(busy, true)?.title).toBe("Dentist");
  });
  it("follows a next link only when it stays on Graph", () => {
    expect(parseGraphEvents({ value: [], "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/calendarView?$skip=100" }, false).nextLink).toContain("$skip=100");
    expect(parseGraphEvents({ value: [], "@odata.nextLink": "https://evil.example/steal" }, false).nextLink).toBeNull();
  });
});

describe("the Microsoft provider", () => {
  it("builds a sign-in address for the common tenant with offline access, calendar read and a PKCE challenge", () => {
    const url = new URL(provider(vi.fn() as unknown as typeof fetch).authorizationUrl({ state: "s".repeat(22), challenge: "c".repeat(43), redirectUri: "https://leads.example/api/calendar/callback/microsoft" }));
    expect(url.origin + url.pathname).toBe(MICROSOFT_AUTH_URL);
    expect(url.pathname).toContain("/common/");
    expect(url.searchParams.get("scope")).toBe(MICROSOFT_SCOPE);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
  it("hands back the new refresh token a refresh issues, which replaces the old one", async () => {
    const tokens = await provider((async () => json({ access_token: "at2", refresh_token: "rt2", expires_in: 3600 })) as unknown as typeof fetch).refresh("rt1");
    expect(tokens).toMatchObject({ accessToken: "at2", refreshToken: "rt2" });
  });
  it("treats invalid_grant as a refusal", async () => {
    await expect(provider((async () => json({ error: "invalid_grant" }, 400)) as unknown as typeof fetch).refresh("rt")).rejects.toBeInstanceOf(CalendarAuthError);
  });
  it("asks for UTC, selects no title for a sync, and follows the pages", async () => {
    const calls: { url: string; prefer: string }[] = [];
    const pages = [{ value: [busy], "@odata.nextLink": `${GRAPH_VIEW_URL}?$skip=100` }, { value: [] }];
    const reader = provider((async (url: string, init: RequestInit) => { calls.push({ url, prefer: String((init.headers as Record<string, string>).Prefer) }); return json(pages[calls.length - 1]); }) as unknown as typeof fetch);
    const events = await reader.listEvents("token", { start: new Date("2026-12-01T00:00:00Z"), end: new Date("2026-12-31T00:00:00Z") }, { withTitles: false });
    expect(events).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.prefer).toBe('outlook.timezone="UTC"');
    expect(decodeURIComponent(calls[0]?.url ?? "")).not.toContain("subject");
    const withTitles: string[] = [];
    await provider((async (url: string) => { withTitles.push(decodeURIComponent(url)); return json({ value: [] }); }) as unknown as typeof fetch).listEvents("t", { start: new Date("2026-12-01T00:00:00Z"), end: new Date("2026-12-31T00:00:00Z") }, { withTitles: true });
    expect(withTitles[0]).toContain("subject");
  });
  it("has nothing to revoke, and says so by doing nothing", async () => {
    const fetchMock = vi.fn();
    await provider(fetchMock as unknown as typeof fetch).revoke("rt");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
