import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { agreement, calendarConnection, campaign, campaignShare, member, memberBusy, user } from "@/server/db/schema";
import type { TenantActor } from "@/server/domain/alias-identity";
import { listCalendarWarnings, listMyCalendarConnections, disconnectCalendar, saveConnection } from "@/server/calendar/connections";
import { decryptToken, tokenKey } from "@/server/calendar/crypto";
import { fakeCalendarProvider } from "@/server/calendar/fake";
import { assertLiveFree } from "@/server/calendar/live-check";
import type { CalendarEvent } from "@/server/calendar/provider";
import { BROKEN_AFTER_FAILURES, PORTAL_UID_SUFFIX, readOwnEvents, syncCalendars, syncConnection, type CalendarDeps } from "@/server/calendar/sync";
import { readTeamTimeForTenant } from "@/server/domain/team-availability";
import { memberIdFor, userIn } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

/**
 * Calendar step F: a connected calendar gives bare busy times, never titles; a refused connection is broken at once and tells its owner; faults count to three;
 * a person reads their own events with titles from a live read that stores nothing; and the live check at booking reads only people of the campaign's team.
 * Every provider is the fake: no test calls Google or Microsoft.
 */
const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});

const key = tokenKey(randomBytes(32).toString("base64url"));
const HOUR = 3_600_000;
const owner = () => rig.dbs.owner.db;
const agencyDb = () => rig.dbs.roles.leads_agency.db;
const clientDb = () => rig.dbs.roles.leads_client.db;
const fynixDb = () => rig.dbs.roles.leads_fynix.db;
const NOW = new Date();
const TITLE = "SECRET-TITLE-9f3a";

const event = (startHours: number, hours = 1, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  icalUid: null,
  start: new Date(NOW.getTime() + startHours * HOUR),
  end: new Date(NOW.getTime() + (startHours + hours) * HOUR),
  busy: true,
  title: TITLE,
  allDay: false,
  ...over,
});

let cast: { campaignId: string; agency: TenantActor; person: TenantActor; personMember: string; personOrg: string };

beforeEach(async () => {
  const world = await rig.reset();
  const db = owner();
  await db.update(campaign).set({ status: "active", timeZone: "Europe/London" });
  const target = world.campaigns.find((row) => row.agency.id === world.brightpath.id && row.client.id === world.kestrel.id);
  if (target === undefined) throw new Error("The seed has no Brightpath campaign for Kestrel");
  const personUser = userIn(rig, world.kestrel);
  const agencyUser = userIn(rig, world.brightpath);
  const admin = world.users[0];
  if (admin === undefined) throw new Error("No Fynix admin");
  await db.insert(agreement).values({ campaignId: target.id, party: "client", version: 1, monthlyTarget: 12, totalTarget: 72, createdBy: await memberIdFor(rig, admin.id) });
  await db.insert(campaignShare).values({ campaignId: target.id, agencyOrgId: world.brightpath.id, monthlyShare: 5 }).onConflictDoNothing();
  cast = {
    campaignId: target.id,
    agency: { userId: agencyUser.id, orgId: world.brightpath.id, orgKind: "agency", role: "manager" },
    person: { userId: personUser.id, orgId: world.kestrel.id, orgKind: "client", role: "member" },
    personMember: await memberIdFor(rig, personUser.id),
    personOrg: world.kestrel.id,
  };
});

const deps = (provider = fakeCalendarProvider({ events: { "refresh-of-code-1": [event(10), event(30, 2, { busy: false })] } })): CalendarDeps & { provider: ReturnType<typeof fakeCalendarProvider> } => ({
  authDb: rig.deps().authDb,
  setup: { key, providers: { google: provider } },
  provider,
});
const connectionRow = async () => (await owner().select().from(calendarConnection))[0];
const busyRows = () => owner().select().from(memberBusy);
const agencyView = async () =>
  (await readTeamTimeForTenant(agencyDb(), cast.agency, { campaignId: cast.campaignId, from: new Date(NOW.getTime() - HOUR).toISOString(), to: new Date(NOW.getTime() + 60 * 24 * HOUR).toISOString() })).find((person) => person.memberId === cast.personMember);

describe("syncing a connected calendar", () => {
  it("stores the refresh token encrypted, reads once at once, and keeps only the busy times", async () => {
    const d = deps();
    await saveConnection(d, { memberId: cast.personMember, provider: "google", refreshToken: "refresh-of-code-1" }, NOW);
    const row = await connectionRow();
    expect(row?.refreshTokenEnc).not.toContain("refresh-of-code-1");
    expect(row && decryptToken(row.refreshTokenEnc, key)).toBe("refresh-of-code-1");
    expect(row).toMatchObject({ status: "connected", failedSyncs: 0 });
    expect(row?.lastSyncedAt).not.toBeNull();
    expect((await busyRows()).map((span) => [span.startsAt.getTime(), span.endsAt.getTime()])).toEqual([[event(10).start.getTime(), event(10).end.getTime()]]);
    expect(d.provider.reads).toEqual([false]);
  });

  it("makes the person busy for their colleagues and the agency, as a bare start and end", async () => {
    await saveConnection(deps(), { memberId: cast.personMember, provider: "google", refreshToken: "refresh-of-code-1" }, NOW);
    const seen = await agencyView();
    expect(seen?.busy.map((span) => span.start.getTime())).toContain(event(10).start.getTime());
    expect(JSON.stringify(await agencyView())).not.toContain(TITLE);
  });

  it("never writes a title to the database or a log", async () => {
    const logs: string[] = [];
    const spies = (["log", "error", "warn", "info"] as const).map((name) => vi.spyOn(console, name).mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(" "))));
    try {
      const d = deps();
      await saveConnection(d, { memberId: cast.personMember, provider: "google", refreshToken: "refresh-of-code-1" }, NOW);
      await syncCalendars(d, NOW);
      await syncCalendars(deps(fakeCalendarProvider({ refused: new Set(["refresh-of-code-1"]), events: { "refresh-of-code-1": [event(10)] } })), NOW);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
    expect(logs.join("\n")).not.toContain(TITLE);
    for (const table of ["calendar_connection", "member_busy", "notification", "audit_log", "lead_history"]) {
      const dump = await owner().execute<{ row: string }>(sql.raw(`select t::text as row from ${table} t`));
      expect(JSON.stringify(dump.rows), table).not.toContain(TITLE);
    }
  });

  it("replaces the busy times each time, so an event that was removed stops counting", async () => {
    const d = deps();
    await saveConnection(d, { memberId: cast.personMember, provider: "google", refreshToken: "refresh-of-code-1" }, NOW);
    expect(await busyRows()).toHaveLength(1);
    const row = await connectionRow();
    if (row === undefined) throw new Error("no connection");
    await syncConnection(deps(fakeCalendarProvider({ events: { "refresh-of-code-1": [event(50)] } })), row, NOW);
    expect((await busyRows()).map((span) => span.startsAt.getTime())).toEqual([event(50).start.getTime()]);
  });

  it("stores the new refresh token a provider issues, before anything else can fail", async () => {
    const rotating = fakeCalendarProvider({ rotates: true, events: {} });
    await saveConnection(deps(rotating), { memberId: cast.personMember, provider: "google", refreshToken: "refresh-of-code-1" }, NOW);
    const row = await connectionRow();
    expect(row && decryptToken(row.refreshTokenEnc, key)).toBe("refresh-of-code-1+");
  });
});

describe("a connection that stops working", () => {
  it("is broken at once when the provider refuses it: its busy times go, its owner is told once, and Fynix sees the warning", async () => {
    await saveConnection(deps(), { memberId: cast.personMember, provider: "google", refreshToken: "refresh-of-code-1" }, NOW);
    expect(await busyRows()).toHaveLength(1);
    const refused = deps(fakeCalendarProvider({ refused: new Set(["refresh-of-code-1"]) }));
    expect(await syncCalendars(refused, NOW)).toMatchObject({ broken: 1, synced: 0 });
    expect((await connectionRow())?.status).toBe("broken");
    expect(await busyRows()).toEqual([]);
    expect((await agencyView())?.busy).toEqual([]);
    const notices = await owner().execute<{ n: string }>(sql`select count(*)::text as n from notification where title = 'Your calendar needs to be connected again' and user_id = ${cast.person.userId}`);
    expect(notices.rows[0]?.n).toBe("1");
    // A broken connection is not read again, so the owner is not told twice.
    expect(await syncCalendars(refused, NOW)).toMatchObject({ broken: 0, synced: 0 });
    const warnings = await listCalendarWarnings(fynixDb(), rig.actor);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ provider: "google" });
    expect(await listMyCalendarConnections(clientDb(), cast.person)).toMatchObject([{ provider: "google", status: "broken" }]);
  });

  it("counts other faults and is broken on the third in a row, and a good read in between starts the count again", async () => {
    await saveConnection(deps(), { memberId: cast.personMember, provider: "google", refreshToken: "refresh-of-code-1" }, NOW);
    const failing = deps(fakeCalendarProvider({ failing: new Set(["refresh-of-code-1"]) }));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      for (let attempt = 1; attempt < BROKEN_AFTER_FAILURES; attempt += 1) {
        expect(await syncCalendars(failing, NOW)).toMatchObject({ failed: 1 });
        expect((await connectionRow())?.status).toBe("connected");
      }
      await syncCalendars(deps(), NOW);
      expect((await connectionRow())?.failedSyncs).toBe(0);
      for (let attempt = 1; attempt < BROKEN_AFTER_FAILURES; attempt += 1) await syncCalendars(failing, NOW);
      expect((await connectionRow())?.status).toBe("connected");
      expect(await syncCalendars(failing, NOW)).toMatchObject({ broken: 1 });
    } finally {
      quiet.mockRestore();
    }
    expect((await connectionRow())?.status).toBe("broken");
  });

  it("leaves everyone else alone: a fault with one person does not stop the next", async () => {
    const [colleagueUser] = await owner().insert(user).values({ email: "colleague@kestrel-calendar.example", name: "Colleague Calendar" }).returning({ id: user.id });
    const [other] = await owner().insert(member).values({ userId: colleagueUser?.id ?? "", orgId: cast.personOrg, orgKind: "client", role: "member", displayName: "Colleague Calendar" }).returning({ id: member.id });
    if (other === undefined) throw new Error("The colleague was not added");
    await saveConnection(deps(), { memberId: cast.personMember, provider: "google", refreshToken: "refresh-of-code-1" }, NOW);
    await saveConnection(deps(fakeCalendarProvider({ events: { "refresh-of-code-2": [event(12)] } })), { memberId: other.id, provider: "google", refreshToken: "refresh-of-code-2" }, NOW);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const totals = await syncCalendars(deps(fakeCalendarProvider({ failing: new Set(["refresh-of-code-1"]), events: { "refresh-of-code-2": [event(12)] } })), NOW);
      expect(totals).toMatchObject({ failed: 1, synced: 1 });
    } finally {
      quiet.mockRestore();
    }
  });

  it("is made to work again by connecting again", async () => {
    await saveConnection(deps(), { memberId: cast.personMember, provider: "google", refreshToken: "refresh-of-code-1" }, NOW);
    await syncCalendars(deps(fakeCalendarProvider({ refused: new Set(["refresh-of-code-1"]) })), NOW);
    expect((await connectionRow())?.status).toBe("broken");
    await saveConnection(deps(), { memberId: cast.personMember, provider: "google", refreshToken: "refresh-of-code-1" }, NOW);
    expect(await connectionRow()).toMatchObject({ status: "connected", failedSyncs: 0 });
    expect(await busyRows()).toHaveLength(1);
  });
});

describe("disconnecting", () => {
  it("revokes the token, then removes the connection and its busy times; the person can see only their own", async () => {
    const d = deps();
    await saveConnection(d, { memberId: cast.personMember, provider: "google", refreshToken: "refresh-of-code-1" }, NOW);
    expect(await listMyCalendarConnections(clientDb(), cast.person)).toHaveLength(1);
    expect(await listMyCalendarConnections(clientDb(), { ...cast.person, userId: cast.agency.userId })).toEqual([]);
    await disconnectCalendar(d, { userId: cast.person.userId, orgId: cast.person.orgId }, "google");
    expect(d.provider.revoked).toEqual(["refresh-of-code-1"]);
    expect(await owner().select().from(calendarConnection)).toEqual([]);
    expect(await busyRows()).toEqual([]);
    expect((await agencyView())?.busy).toEqual([]);
  });
});

describe("a person's own events", () => {
  it("come back with their titles, drop a portal meeting that returns, and are stored nowhere", async () => {
    const own = fakeCalendarProvider({ events: { "refresh-of-code-1": [event(5, 1, { title: "Dentist" }), event(8, 1, { title: "MTG-AAAA", icalUid: `MTG-AAAA${PORTAL_UID_SUFFIX}` }), event(9, 1, { busy: false, title: "Lunch" })] } });
    const d = deps(own);
    await saveConnection(d, { memberId: cast.personMember, provider: "google", refreshToken: "refresh-of-code-1" }, NOW);
    const before = JSON.stringify([await owner().select().from(calendarConnection), await busyRows()]);
    const result = await readOwnEvents(d, { userId: cast.person.userId, orgId: cast.person.orgId }, { start: NOW, end: new Date(NOW.getTime() + 48 * HOUR) }, NOW);
    expect(result.events.map((item) => item.title)).toEqual(["Dentist"]);
    expect(result.problems).toEqual([]);
    expect(own.reads.at(-1)).toBe(true);
    // Reading it left no trace: the stored rows are as they were.
    expect(JSON.stringify([await owner().select().from(calendarConnection), await busyRows()]).replace(/"updatedAt":"[^"]+"/g, "")).toBe(before.replace(/"updatedAt":"[^"]+"/g, ""));
  });

  it("are empty for a person who is not a client person, and name a provider that did not answer", async () => {
    const d = deps();
    await saveConnection(d, { memberId: cast.personMember, provider: "google", refreshToken: "refresh-of-code-1" }, NOW);
    expect((await readOwnEvents(d, { userId: cast.agency.userId, orgId: cast.agency.orgId }, { start: NOW, end: new Date(NOW.getTime() + HOUR) }, NOW)).events).toEqual([]);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const failing = deps(fakeCalendarProvider({ failing: new Set(["refresh-of-code-1"]) }));
      expect((await readOwnEvents(failing, { userId: cast.person.userId, orgId: cast.person.orgId }, { start: NOW, end: new Date(NOW.getTime() + HOUR) }, NOW)).problems).toEqual(["google"]);
    } finally {
      quiet.mockRestore();
    }
  });
});

describe("the live check at booking", () => {
  const slot = new Date(NOW.getTime() + 72 * HOUR);
  afterEach(() => vi.restoreAllMocks());

  it("refuses when a person turns out busy right now, naming nobody, and passes when they are free", async () => {
    await saveConnection(deps(fakeCalendarProvider({ events: {} })), { memberId: cast.personMember, provider: "google", refreshToken: "refresh-of-code-1" }, NOW);
    const busyNow = deps(fakeCalendarProvider({ events: { "refresh-of-code-1": [{ ...event(0), start: new Date(slot.getTime() + 10 * 60_000), end: new Date(slot.getTime() + 40 * 60_000) }] } }));
    await expect(assertLiveFree(agencyDb(), busyNow, cast.agency, { campaignId: cast.campaignId, memberIds: [cast.personMember], slot })).rejects.toMatchObject({ code: "invalid-input", message: expect.not.stringContaining("Kestrel") });
    await expect(assertLiveFree(agencyDb(), deps(fakeCalendarProvider({ events: {} })), cast.agency, { campaignId: cast.campaignId, memberIds: [cast.personMember], slot })).resolves.toBeUndefined();
  });

  it("does nothing while calendars are off, and skips a provider that does not answer", async () => {
    await expect(assertLiveFree(agencyDb(), null, cast.agency, { campaignId: cast.campaignId, memberIds: [cast.personMember], slot })).resolves.toBeUndefined();
    await saveConnection(deps(fakeCalendarProvider({ events: {} })), { memberId: cast.personMember, provider: "google", refreshToken: "refresh-of-code-1" }, NOW);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(assertLiveFree(agencyDb(), deps(fakeCalendarProvider({ failing: new Set(["refresh-of-code-1"]) })), cast.agency, { campaignId: cast.campaignId, memberIds: [cast.personMember], slot })).resolves.toBeUndefined();
  });

  it("reads only people of the campaign's client team, so an agency cannot make the portal read anyone's calendar", async () => {
    const world = await owner().select({ id: member.id }).from(member).where(sql`${member.orgKind} = 'client' and ${member.orgId} <> ${cast.personOrg}`);
    const stranger = world[0]?.id;
    if (stranger === undefined) throw new Error("The seed has no other client");
    const reader = fakeCalendarProvider({ events: { "refresh-of-code-9": [{ ...event(0), start: slot, end: new Date(slot.getTime() + HOUR) }] } });
    await saveConnection(deps(reader), { memberId: stranger, provider: "google", refreshToken: "refresh-of-code-9" }, NOW);
    reader.refreshed.length = 0;
    await assertLiveFree(agencyDb(), deps(reader), cast.agency, { campaignId: cast.campaignId, memberIds: [stranger], slot });
    expect(reader.refreshed).toEqual([]);
  });
});
