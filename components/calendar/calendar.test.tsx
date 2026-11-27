import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CalendarData, CalendarMeeting } from "@/server/domain/calendar-data";

vi.mock("@/server/domain/team-actions", () => ({ replyInvitationAction: async () => ({ status: "idle" as const }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }), usePathname: () => "/agency/calendar" }));

const { DayGrid, MonthGrid, WeekGrid } = await import("@/components/calendar/calendar-grids");
const { CalendarScreen } = await import("@/components/calendar/calendar-screen");
const { InvitationsPanel } = await import("@/components/calendar/invitations-panel");

const week = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1020 }));
const anna = { memberId: "a", displayName: "Anna Rao", timeZone: "UTC", hours: week, busy: [{ start: "2026-12-03T12:00:00.000Z", end: "2026-12-03T13:00:00.000Z" }] };
const ben = { memberId: "b", displayName: "Ben Okafor", timeZone: "UTC", hours: week, busy: [] };
const NOW = new Date("2026-12-01T09:00:00Z");
const meeting: CalendarMeeting = { id: "m1", ref: "MTG-AAAA", start: "2026-12-03T10:00:00.000Z", minutes: 30, status: "scheduled", company: "Nordvik Cold Chain", link: "https://meet.google.com/aaa-bbbb-ccc", with: null };
const href = (day: string) => `/agency/calendar?view=day&date=${day}`;

describe("the day view", () => {
  it("has a lane for each person and shows only what is booked, with no word for free time or working hours", () => {
    const html = renderToStaticMarkup(<DayGrid people={[anna, ben]} dayKey="2026-12-03" zone="UTC" />);
    expect(html).toContain("Anna Rao");
    expect(html).toContain("Ben Okafor");
    expect(html).toContain("Booked");
    for (const word of ["Free", "Busy", "Not working", "Too soon"]) expect(html).not.toContain(word);
  });

  it("covers the whole day, from midnight", () => {
    const html = renderToStaticMarkup(<DayGrid people={[anna]} dayKey="2026-12-03" zone="UTC" />);
    for (const hour of ["00:00", "03:00", "23:00"]) expect(html).toContain(hour);
  });
});

describe("the week view", () => {
  const days = ["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"];
  const render = () => renderToStaticMarkup(<WeekGrid days={days} meetings={[meeting]} zone="UTC" todayKey="2026-12-01" dayHref={href} />);

  it("shows the meeting, no free time, and links each day to its own view", () => {
    const html = render();
    expect(html).not.toMatch(/free/i);
    expect(html).toContain("10:00 Nordvik Cold Chain");
    expect(html).toContain('href="/agency/calendar?view=day&amp;date=2026-12-03"');
  });
});

describe("the month view", () => {
  it("shows the meetings of a day and no free times", () => {
    const html = renderToStaticMarkup(<MonthGrid dateKey="2026-12-03" meetings={[meeting]} zone="UTC" todayKey="2026-12-01" dayHref={href} />);
    expect(html).toContain("10:00 Nordvik Cold Chain");
    expect(html).not.toMatch(/free/i);
    expect(html).toContain('href="/agency/calendar?view=day&amp;date=2026-12-24"');
  });
});

describe("the calendar screen", () => {
  const data: CalendarData = { choices: [{ campaignId: "c1", label: "Kestrel Logistics" }, { campaignId: "c2", label: "Halden Foods" }], selected: "c1", people: [anna, ben], meetings: [meeting] };
  const render = (over: Partial<CalendarData> = {}, view: "month" | "week" | "day" = "week") =>
    renderToStaticMarkup(<CalendarScreen data={{ ...data, ...over }} query={{ view, date: "2026-12-03" }} basePath="/agency/calendar" now={NOW.toISOString()} />);

  it("offers a choice of agency to Fynix only, with all agencies first", () => {
    const agencies = [{ id: "a1", label: "Brightpath" }, { id: "a2", label: "Northline" }];
    const html = render({ agencies, agency: "a2" });
    expect(html).toContain("All agencies");
    expect(html).toContain("Northline");
    expect(render()).not.toContain("All agencies");
    expect(render({ agencies: [agencies[0] ?? { id: "x", label: "x" }] })).not.toContain("All agencies");
  });

  it("offers a choice of client only when there is one to make", () => {
    expect(render()).toContain("Halden Foods");
    expect(render({ choices: [] })).not.toContain("<select");
  });

  it("marks the open view, keeps the client in every link and names the time zone", () => {
    const html = render();
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Month");
    expect(html).toContain("Previous");
    expect(html).toContain("Today");
    expect(html).toContain("team=c1");
    expect(html).toContain("30 November to 6 December 2026");
    expect(html).toContain("Times are in your time zone, UTC.");
  });

  it("lists the meetings in view with a link to join, or says the link is to follow", () => {
    expect(render()).toContain('href="https://meet.google.com/aaa-bbbb-ccc"');
    expect(render()).toContain("Meeting link");
    const without = render({ meetings: [{ ...meeting, link: null }] });
    expect(without).toContain("Link to follow");
    expect(without).not.toContain("meet.google.com");
  });

  it("names the client person on a meeting only when the data carries one", () => {
    expect(render({ meetings: [{ ...meeting, with: "Priya Nair" }] })).toContain("with Priya Nair");
    expect(render()).not.toContain("with ");
  });

  it("says so when there is no campaign, and when a client has no team", () => {
    expect(render({ choices: [], selected: null, people: [], meetings: [] })).toContain("No clients to show yet");
    expect(render({ people: [] })).toContain("No team members yet");
  });

  it("draws every view and uses no dashes in its words", () => {
    const html = (["month", "week", "day"] as const).map((view) => render({}, view)).join("");
    expect(html).not.toMatch(/[\u2013\u2014]/);
    expect(html).not.toMatch(/\bhosts?\b/i);
  });
});

describe("the meeting invitations", () => {
  const invitation = { meetingId: "m1", meetingRef: "MTG-AAAA", company: "Nordvik Cold Chain", campaignName: "UK logistics", startsAt: "2026-12-03T10:00:00.000Z", minutes: 30, reply: "invited" as const, replyDueAt: "2026-12-02T10:00:00.000Z" };
  const render = (reply: "invited" | "accepted" | "released") => renderToStaticMarkup(<InvitationsPanel invitations={[{ ...invitation, reply }]} />);

  it("shows nothing when there are no invitations", () => {
    expect(renderToStaticMarkup(<InvitationsPanel invitations={[]} />)).toBe("");
  });

  it("offers Accept and Decline while a reply is waiting, with the deadline", () => {
    const html = render("invited");
    expect(html).toContain("Nordvik Cold Chain");
    expect(html).toContain("Waiting for your reply");
    expect(html).toContain("Reply by");
    expect(html).toContain('value="accepted"');
    expect(html).toContain('value="declined"');
  });

  it("offers only Decline after accepting and only Accept after someone else took it", () => {
    const accepted = render("accepted");
    expect(accepted).toContain("You accepted");
    expect(accepted).not.toContain('value="accepted"');
    expect(accepted).toContain('value="declined"');
    const released = render("released");
    expect(released).toContain("Someone else accepted first");
    expect(released).toContain('value="accepted"');
    expect(released).not.toContain('value="declined"');
  });

  it("uses no dashes and no host in its words", () => {
    const html = (["invited", "accepted", "released"] as const).map(render).join("");
    expect(html).not.toMatch(/[\u2013\u2014]/);
    expect(html).not.toMatch(/\bhosts?\b/i);
  });
});
