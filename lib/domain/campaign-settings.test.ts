import { describe, expect, it } from "vitest";
import { DEFAULT_CAMPAIGN_TIME_ZONE, DEFAULT_MEETING_MINUTES, MEETING_MINUTES_MAX, MEETING_MINUTES_MIN, isIanaTimeZone } from "@/lib/domain/campaign-settings";

describe("campaign settings", () => {
  it("defaults to London time and a 30 minute meeting, inside the allowed range", () => {
    expect(DEFAULT_CAMPAIGN_TIME_ZONE).toBe("Europe/London");
    expect(DEFAULT_MEETING_MINUTES).toBe(30);
    expect(MEETING_MINUTES_MIN).toBe(15);
    expect(MEETING_MINUTES_MAX).toBe(240);
    expect(DEFAULT_MEETING_MINUTES).toBeGreaterThanOrEqual(MEETING_MINUTES_MIN);
    expect(DEFAULT_MEETING_MINUTES).toBeLessThanOrEqual(MEETING_MINUTES_MAX);
  });

  it.each(["Europe/London", "Asia/Kolkata", "America/Argentina/Buenos_Aires", "UTC", "Pacific/Auckland"])("accepts the time zone %s", (zone) => {
    expect(isIanaTimeZone(zone)).toBe(true);
  });

  it.each(["", " ", "Mars/Olympus", "+01:00", "GMT+1 hour", "Europe/London; drop table", "Europe//London", "x".repeat(65)])("refuses %j", (zone) => {
    expect(isIanaTimeZone(zone)).toBe(false);
  });
});
