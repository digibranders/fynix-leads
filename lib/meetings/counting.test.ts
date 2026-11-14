import { describe, expect, it } from "vitest";
import { meetingCountingMonth } from "./counting";

describe("meetingCountingMonth", () => {
  it("formats regular meeting time as YYYY-MM in target time zone", () => {
    const meeting = new Date("2026-06-15T10:00:00.000Z");
    expect(meetingCountingMonth(meeting, "Europe/London")).toBe("2026-06");
    expect(meetingCountingMonth(meeting, "America/New_York")).toBe("2026-06");
  });

  it("handles month boundary correctly across time zones", () => {
    // 2026-11-01 at 02:00:00 UTC
    // In America/New_York (EDT UTC-4), this is 2026-10-31 22:00:00
    // In UTC, this is 2026-11-01 02:00:00
    const boundaryTime = new Date("2026-11-01T02:00:00.000Z");
    expect(meetingCountingMonth(boundaryTime, "UTC")).toBe("2026-11");
    expect(meetingCountingMonth(boundaryTime, "America/New_York")).toBe("2026-10");
  });

  it("handles year boundary correctly across time zones", () => {
    // 2026-12-31 at 20:00:00 UTC
    // In Asia/Kolkata (IST UTC+5:30), this is 2027-01-01 01:30:00
    // In UTC, this is 2026-12-31 20:00:00
    const yearBoundary = new Date("2026-12-31T20:00:00.000Z");
    expect(meetingCountingMonth(yearBoundary, "UTC")).toBe("2026-12");
    expect(meetingCountingMonth(yearBoundary, "Asia/Kolkata")).toBe("2027-01");
  });
});
