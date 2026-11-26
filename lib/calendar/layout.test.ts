import { describe, expect, it } from "vitest";
import { dayRuns, freeRuns, freeSlotCount, meetingsOnDay, type CalendarPersonLike } from "./layout";

const week = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1020 }));
const person = (over: Partial<CalendarPersonLike> = {}): CalendarPersonLike => ({ memberId: "a", displayName: "Anna", timeZone: "Europe/London", hours: week, busy: [], ...over });
// A Tuesday. Thursday 2026-12-03 is the first day with a bookable moment: 48 hours later is Thursday 09:00 UTC. London is on UTC in December.
const NOW = new Date("2026-12-01T09:00:00Z");
const busy = (from: string, to: string) => ({ start: from, end: to });

describe("dayRuns", () => {
  it("splits a day into not working, free and not working, in the viewer's zone", () => {
    expect(dayRuns(person(), "2026-12-03", "Europe/London", NOW)).toEqual([
      { state: "off", fromMinute: 360, toMinute: 540 },
      { state: "free", fromMinute: 540, toMinute: 1020 },
      { state: "off", fromMinute: 1020, toMinute: 1320 },
    ]);
  });

  it("shows busy time inside the working day without saying why", () => {
    const runs = dayRuns(person({ busy: [busy("2026-12-03T12:00:00Z", "2026-12-03T13:00:00Z")] }), "2026-12-03", "Europe/London", NOW);
    expect(runs.filter((run) => run.state !== "off")).toEqual([
      { state: "free", fromMinute: 540, toMinute: 720 },
      { state: "busy", fromMinute: 720, toMinute: 780 },
      { state: "free", fromMinute: 780, toMinute: 1020 },
    ]);
  });

  it("marks time inside the 48 hour notice as not yet bookable", () => {
    const runs = dayRuns(person(), "2026-12-03", "Europe/London", new Date("2026-12-02T12:00:00Z"));
    expect(runs.find((run) => run.fromMinute === 540)).toEqual({ state: "soon", fromMinute: 540, toMinute: 1020 });
  });

  it("lays the person's hours out in a viewer's own zone", () => {
    const runs = dayRuns(person(), "2026-12-03", "Asia/Kolkata", NOW);
    // 09:00 to 17:00 in London is 14:30 to 22:30 in India, and the grid ends at 22:00.
    expect(runs).toEqual([
      { state: "off", fromMinute: 360, toMinute: 870 },
      { state: "free", fromMinute: 870, toMinute: 1320 },
    ]);
  });
});

describe("freeRuns and freeSlotCount", () => {
  const people = [person({ memberId: "a", busy: [busy("2026-12-03T10:00:00Z", "2026-12-03T10:30:00Z")] }), person({ memberId: "b", displayName: "Ben" })];

  it("counts how many people are free in each stretch and leaves out stretches where nobody is", () => {
    expect(freeRuns(people, "2026-12-03", "Europe/London", NOW)).toEqual([
      { fromMinute: 540, toMinute: 600, free: 2, of: 2 },
      { fromMinute: 600, toMinute: 630, free: 1, of: 2 },
      { fromMinute: 630, toMinute: 1020, free: 2, of: 2 },
    ]);
    const nobody = [person({ memberId: "a", busy: [busy("2026-12-03T00:00:00Z", "2026-12-04T00:00:00Z")] })];
    expect(freeRuns(nobody, "2026-12-03", "Europe/London", NOW)).toEqual([]);
  });

  it("counts the half hours of a day with someone free, none on a day off or inside the notice", () => {
    expect(freeSlotCount(people, "2026-12-03", "Europe/London", NOW)).toBe(16);
    expect(freeSlotCount(people, "2026-12-05", "Europe/London", NOW)).toBe(0);
    expect(freeSlotCount(people, "2026-12-02", "Europe/London", NOW)).toBe(0);
  });
});

describe("meetingsOnDay", () => {
  const meetings = [
    { id: "2", start: "2026-12-03T15:00:00Z" },
    { id: "1", start: "2026-12-03T09:00:00Z" },
    { id: "3", start: "2026-12-03T23:30:00Z" },
  ];

  it("keeps the meetings that fall on a day in the viewer's zone, earliest first", () => {
    expect(meetingsOnDay(meetings, "2026-12-03", "Europe/London").map((meeting) => meeting.id)).toEqual(["1", "2", "3"]);
    expect(meetingsOnDay(meetings, "2026-12-04", "Asia/Kolkata").map((meeting) => meeting.id)).toEqual(["3"]);
  });
});
