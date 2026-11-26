import { describe, expect, it } from "vitest";
import { addDays, calendarHref, dayKeyIn, fetchRange, minutesIntoDay, monthGrid, parseCalendarQuery, shiftQuery, slotInstants, titleFor, weekStart } from "./view";

describe("parseCalendarQuery", () => {
  it("keeps a valid view and date", () => {
    expect(parseCalendarQuery({ view: "month", date: "2026-11-26" }, "2026-12-01")).toEqual({ view: "month", date: "2026-11-26" });
  });

  it("falls back to the week of today for a missing, unknown or impossible value", () => {
    expect(parseCalendarQuery({}, "2026-12-01")).toEqual({ view: "week", date: "2026-12-01" });
    expect(parseCalendarQuery({ view: "year", date: "tomorrow" }, "2026-12-01")).toEqual({ view: "week", date: "2026-12-01" });
    expect(parseCalendarQuery({ view: "day", date: "2026-02-30" }, "2026-12-01")).toEqual({ view: "day", date: "2026-12-01" });
  });
});

describe("days", () => {
  it("adds days across a month and a year", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("starts the week on Monday", () => {
    expect(weekStart("2026-11-26")).toBe("2026-11-23");
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
    expect(weekStart("2026-11-29")).toBe("2026-11-23");
  });
});

describe("monthGrid", () => {
  it("covers whole weeks, Monday to Sunday, and marks the days of the month", () => {
    const grid = monthGrid("2026-11-15");
    expect(grid).toHaveLength(6);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid[0]?.[0]).toEqual({ key: "2026-10-26", inMonth: false });
    expect(grid[0]?.[6]).toEqual({ key: "2026-11-01", inMonth: true });
    expect(grid[5]?.[6]).toEqual({ key: "2026-12-06", inMonth: false });
    expect(grid.flat().filter((cell) => cell.inMonth)).toHaveLength(30);
  });
});

describe("shiftQuery", () => {
  it("moves a day, a week or a month", () => {
    expect(shiftQuery({ view: "day", date: "2026-11-26" }, 1)).toEqual({ view: "day", date: "2026-11-27" });
    expect(shiftQuery({ view: "week", date: "2026-11-26" }, -1)).toEqual({ view: "week", date: "2026-11-19" });
    expect(shiftQuery({ view: "month", date: "2026-12-31" }, -1)).toEqual({ view: "month", date: "2026-11-01" });
    expect(shiftQuery({ view: "month", date: "2026-12-31" }, 1)).toEqual({ view: "month", date: "2027-01-01" });
  });
});

describe("fetchRange", () => {
  it("pads the visible days by a day each side so any time zone is covered, and never passes 62 days", () => {
    const day = fetchRange({ view: "day", date: "2026-11-26" });
    expect(day.from.toISOString()).toBe("2026-11-25T00:00:00.000Z");
    expect(day.to.toISOString()).toBe("2026-11-28T00:00:00.000Z");
    for (const date of ["2026-02-10", "2026-11-15", "2026-12-31"]) {
      const month = fetchRange({ view: "month", date });
      expect((month.to.getTime() - month.from.getTime()) / 86_400_000).toBeLessThanOrEqual(62);
    }
    const week = fetchRange({ view: "week", date: "2026-11-26" });
    expect(week.from.toISOString()).toBe("2026-11-22T00:00:00.000Z");
    expect(week.to.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
});

describe("time in a zone", () => {
  const late = new Date("2026-12-01T23:30:00Z");

  it("names the day an instant falls on in a zone", () => {
    expect(dayKeyIn(late, "Europe/London")).toBe("2026-12-01");
    expect(dayKeyIn(late, "Asia/Kolkata")).toBe("2026-12-02");
    expect(dayKeyIn(late, "America/Los_Angeles")).toBe("2026-12-01");
  });

  it("counts minutes from local midnight", () => {
    expect(minutesIntoDay(late, "Asia/Kolkata")).toBe(5 * 60);
    expect(minutesIntoDay(late, "Europe/London")).toBe(23 * 60 + 30);
  });

  it("lists the instants of a day's slots in a zone", () => {
    const starts = slotInstants("2026-12-03", "Europe/London", 9 * 60, 10 * 60, 30);
    expect(starts.map((at) => at.toISOString())).toEqual(["2026-12-03T09:00:00.000Z", "2026-12-03T09:30:00.000Z"]);
    expect(slotInstants("2027-03-29", "Europe/London", 9 * 60, 9 * 60 + 30, 30)[0]?.toISOString()).toBe("2027-03-29T08:00:00.000Z");
  });
});

describe("titleFor", () => {
  it("names the day, the week and the month", () => {
    expect(titleFor({ view: "day", date: "2026-11-26" })).toBe("Thu 26 November 2026");
    expect(titleFor({ view: "week", date: "2026-11-26" })).toBe("23 to 29 November 2026");
    expect(titleFor({ view: "week", date: "2026-12-02" })).toBe("30 November to 6 December 2026");
    expect(titleFor({ view: "month", date: "2026-11-26" })).toBe("November 2026");
  });
});

describe("calendarHref", () => {
  it("keeps the view and day in the address, and the client when one is chosen", () => {
    expect(calendarHref("/agency/calendar", { view: "week", date: "2026-11-26" }, null)).toBe("/agency/calendar?view=week&date=2026-11-26");
    expect(calendarHref("/agency/calendar", { view: "day", date: "2026-11-26" }, "abc")).toBe("/agency/calendar?view=day&date=2026-11-26&team=abc");
    expect(calendarHref("/fynix/calendar", { view: "day", date: "2026-11-26" }, "abc", "org1")).toBe("/fynix/calendar?view=day&date=2026-11-26&team=abc&agency=org1");
  });
});
