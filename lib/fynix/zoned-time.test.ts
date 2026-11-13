import { describe, expect, it } from "vitest";
import { nextDay, zonedWallTimeToInstant } from "@/lib/fynix/zoned-time";

const iso = (date: Date | null): string | null => (date === null ? null : date.toISOString());

describe("zonedWallTimeToInstant", () => {
  it("reads a wall time in the zone", () => {
    expect(iso(zonedWallTimeToInstant("2026-11-23", "09:00", "Europe/London"))).toBe("2026-11-23T09:00:00.000Z");
    expect(iso(zonedWallTimeToInstant("2026-07-23", "09:00", "Europe/London"))).toBe("2026-07-23T08:00:00.000Z");
    expect(iso(zonedWallTimeToInstant("2026-11-23", "09:00", "Asia/Kolkata"))).toBe("2026-11-23T03:30:00.000Z");
    expect(iso(zonedWallTimeToInstant("2026-11-23", "00:00", "America/New_York"))).toBe("2026-11-23T05:00:00.000Z");
    expect(iso(zonedWallTimeToInstant("2026-11-23", "09:00", "UTC"))).toBe("2026-11-23T09:00:00.000Z");
  });

  it("follows the clocks changing", () => {
    expect(iso(zonedWallTimeToInstant("2026-10-25", "12:00", "Europe/London"))).toBe("2026-10-25T12:00:00.000Z");
    expect(iso(zonedWallTimeToInstant("2026-10-24", "12:00", "Europe/London"))).toBe("2026-10-24T11:00:00.000Z");
    expect(iso(zonedWallTimeToInstant("2027-03-28", "12:00", "Europe/London"))).toBe("2027-03-28T11:00:00.000Z");
  });

  it("refuses a time the zone skips, and reads a repeated hour as the later one", () => {
    expect(zonedWallTimeToInstant("2027-03-28", "01:30", "Europe/London")).toBeNull();
    expect(iso(zonedWallTimeToInstant("2026-10-25", "01:30", "Europe/London"))).toBe("2026-10-25T01:30:00.000Z");
  });

  it("refuses text that is not a date and a time", () => {
    for (const [date, time] of [["2026-02-30", "09:00"], ["2026-13-01", "09:00"], ["23/11/2026", "09:00"], ["2026-11-23", "9:00"], ["2026-11-23", "24:00"], ["2026-11-23", "09:60"], ["", ""]] as const) {
      expect(zonedWallTimeToInstant(date, time, "UTC"), `${date} ${time}`).toBeNull();
    }
  });
});

describe("nextDay", () => {
  it("moves over month and year ends and refuses a bad date", () => {
    expect(nextDay("2026-11-23")).toBe("2026-11-24");
    expect(nextDay("2026-11-30")).toBe("2026-12-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(nextDay("2028-02-28")).toBe("2028-02-29");
    expect(nextDay("nope")).toBeNull();
  });
});
