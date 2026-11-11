import { describe, expect, it } from "vitest";
import { formatIsoDay, formatMonthYear } from "./iso-day";

describe("formatIsoDay", () => {
  it("formats a calendar date without shifting the day", () => {
    expect(formatIsoDay("2026-09-01")).toBe("1 Sep 2026");
    expect(formatIsoDay("2027-02-28")).toBe("28 Feb 2027");
  });
  it("throws a descriptive error for a malformed date", () => {
    expect(() => formatIsoDay("1 Sep 2026")).toThrow(/YYYY-MM-DD/);
  });
});

describe("formatMonthYear", () => {
  it("names the UTC month", () => {
    expect(formatMonthYear(new Date("2026-11-11T10:00:00Z"))).toBe("November 2026");
    expect(formatMonthYear(new Date("2026-12-31T23:59:00Z"))).toBe("December 2026");
  });
});
