import { describe, expect, it } from "vitest";
import { blockParts, capitalise, countOf, formatBlock, monthName, formatClock, formatDate, formatDays, formatDayHours, formatRange, weekSummary, zoneCity, zoneLabel } from "@/lib/fynix/format";

const win = (weekday: number, startMinute: number, endMinute: number) => ({ weekday, startMinute, endMinute });

describe("formatClock", () => {
  it.each([
    [0, "12:00 am"],
    [540, "9:00 am"],
    [720, "12:00 pm"],
    [1020, "5:00 pm"],
    [1439, "11:59 pm"],
    [1440, "12:00 am"],
    [605, "10:05 am"],
  ])("writes minute %i as %s", (minute, text) => expect(formatClock(minute)).toBe(text));
});

describe("formatRange", () => {
  it("writes the period twice when the ends differ and once when they share it", () => {
    expect(formatRange(540, 1020)).toBe("9:00 am to 5:00 pm");
    expect(formatRange(840, 1020)).toBe("2:00 to 5:00 pm");
    expect(formatRange(540, 660)).toBe("9:00 to 11:00 am");
    expect(formatRange(660, 720)).toBe("11:00 am to 12:00 pm");
  });
});

describe("formatDayHours", () => {
  it("lists a split day in order and returns null for a day off", () => {
    const hours = [win(3, 840, 1020), win(3, 540, 720)];
    expect(formatDayHours(hours, 3)).toBe("9:00 am to 12:00 pm, 2:00 to 5:00 pm");
    expect(formatDayHours(hours, 4)).toBeNull();
  });
});

describe("formatDays", () => {
  it.each([
    [[1, 2, 3, 4], "Mon to Thu"],
    [[1, 2, 3, 4, 5], "Mon to Fri"],
    [[1, 3, 5], "Mon, Wed and Fri"],
    [[1, 2, 3, 5], "Mon to Wed and Fri"],
    [[1, 2], "Mon and Tue"],
    [[2], "Tue"],
    [[6, 0], "Sat and Sun"],
    [[0, 1, 2], "Mon, Tue and Sun"],
    [[], ""],
  ])("writes %j as %s", (days, text) => expect(formatDays(days)).toBe(text));
});

describe("weekSummary", () => {
  it("is null when no hours are set", () => expect(weekSummary([])).toBeNull());

  it("gives the days and the shared hours when every day is the same", () => {
    expect(weekSummary([1, 2, 3, 4].map((day) => win(day, 600, 960)))).toEqual({ days: "Mon to Thu", detail: "10:00 am to 4:00 pm" });
  });

  it("names the split days, and says the hours vary when days differ", () => {
    const split = [win(1, 540, 1020), win(3, 540, 720), win(3, 840, 1020), win(5, 540, 780)];
    expect(weekSummary(split)).toEqual({ days: "Mon, Wed and Fri", detail: "Split on Wednesdays" });
    expect(weekSummary([win(1, 540, 1020), win(2, 600, 1020)])).toEqual({ days: "Mon and Tue", detail: "Hours vary by day" });
  });
});

describe("zoneLabel and zoneCity", () => {
  it("names the city and the abbreviation in force", () => {
    expect(zoneLabel("Europe/London", new Date("2026-11-10T12:00:00Z"))).toBe("London time (GMT)");
    expect(zoneLabel("Europe/London", new Date("2026-07-10T12:00:00Z"))).toBe("London time (BST)");
    expect(zoneLabel("America/New_York", new Date("2026-11-10T12:00:00Z"))).toBe("New York time (EST)");
    expect(zoneLabel("UTC", new Date("2026-11-10T12:00:00Z"))).toBe("UTC");
    expect(zoneCity("Europe/London")).toBe("London time");
  });
});

describe("formatBlock", () => {
  it("writes a whole day, a part of a day, a run of days and a span across midnight", () => {
    const zone = "Europe/London";
    expect(formatBlock(new Date("2026-11-23T00:00:00Z"), new Date("2026-11-24T00:00:00Z"), zone)).toBe("Mon 23 Nov, all day");
    expect(formatBlock(new Date("2026-11-26T14:00:00Z"), new Date("2026-11-26T16:00:00Z"), zone)).toBe("Thu 26 Nov, 2:00 to 4:00 pm");
    expect(formatBlock(new Date("2026-11-23T00:00:00Z"), new Date("2026-11-26T00:00:00Z"), zone)).toBe("Mon 23 Nov to Wed 25 Nov, all day");
    expect(formatBlock(new Date("2026-11-23T22:00:00Z"), new Date("2026-11-24T06:00:00Z"), zone)).toBe("Mon 23 Nov, 10:00 pm to Tue 24 Nov, 6:00 am");
  });

  it("reads the instants in the zone it is given", () => {
    expect(formatBlock(new Date("2026-11-23T03:30:00Z"), new Date("2026-11-23T05:30:00Z"), "Asia/Kolkata")).toBe("Mon 23 Nov, 9:00 to 11:00 am");
  });

  it("keeps a whole day whole across the clocks going back", () => {
    expect(formatBlock(new Date("2026-10-24T23:00:00Z"), new Date("2026-10-26T00:00:00Z"), "Europe/London")).toBe("Sun 25 Oct, all day");
  });
});

describe("formatDate and countOf", () => {
  it("writes the date in the zone", () => {
    expect(formatDate(new Date("2026-10-02T23:30:00Z"), "Asia/Kolkata")).toBe("3 Oct 2026");
    expect(formatDate(new Date("2026-10-02T23:30:00Z"), "Europe/London")).toBe("3 Oct 2026");
    expect(formatDate(new Date("2026-10-02T12:00:00Z"), "UTC")).toBe("2 Oct 2026");
  });

  it("chooses the singular or the plural", () => {
    expect(countOf(1, "agency", "agencies")).toBe("1 agency");
    expect(countOf(0, "campaign", "campaigns")).toBe("0 campaigns");
    expect(countOf(2, "campaign", "campaigns")).toBe("2 campaigns");
  });
});

describe("blockParts, capitalise and monthName", () => {
  it("splits a block into the days and the part of them", () => {
    expect(blockParts(new Date("2026-11-23T00:00:00Z"), new Date("2026-11-24T00:00:00Z"), "Europe/London")).toEqual({ day: "Mon 23 Nov", detail: "all day" });
    expect(blockParts(new Date("2026-11-26T14:00:00Z"), new Date("2026-11-26T16:00:00Z"), "Europe/London")).toEqual({ day: "Thu 26 Nov", detail: "2:00 to 4:00 pm" });
  });

  it("starts a sentence with a capital and names the month in the zone", () => {
    expect(capitalise("all day")).toBe("All day");
    expect(capitalise("")).toBe("");
    expect(monthName(new Date("2026-11-30T23:30:00Z"), "Europe/London")).toBe("November");
    expect(monthName(new Date("2026-11-30T23:30:00Z"), "Asia/Kolkata")).toBe("December");
  });
});
