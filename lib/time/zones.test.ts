import { describe, expect, it } from "vitest";
import { formatDayInZone, formatInZone, formatTimeInZone, isOutsideWorkingHours, zoneAbbreviation } from "./zones";

const t = new Date("2026-11-12T09:30:00Z");

describe("zoneAbbreviation", () => {
  it("prefers a named abbreviation over a GMT offset", () => {
    expect(zoneAbbreviation(t, "Asia/Kolkata")).toBe("IST");
    expect(zoneAbbreviation(t, "America/New_York")).toBe("EST");
    expect(zoneAbbreviation(t, "Asia/Dubai")).toBe("GST");
    expect(zoneAbbreviation(t, "Europe/London")).toBe("GMT");
    expect(zoneAbbreviation(new Date("2026-07-01T09:30:00Z"), "Europe/London")).toBe("BST");
  });
});

describe("formatInZone", () => {
  it("formats weekday, date, 12-hour time and zone", () => {
    expect(formatInZone(t, "Asia/Kolkata")).toBe("Thu 12 Nov, 3:00 pm IST");
    expect(formatInZone(t, "Europe/London")).toBe("Thu 12 Nov, 9:30 am GMT");
    expect(formatInZone(t, "America/New_York")).toBe("Thu 12 Nov, 4:30 am EST");
  });
});

describe("formatDayInZone and formatTimeInZone", () => {
  it("give the date and the clock time without the zone name", () => {
    expect(formatDayInZone(t, "Asia/Kolkata")).toBe("Thu 12 Nov");
    expect(formatTimeInZone(t, "Asia/Kolkata")).toBe("3:00 pm");
    expect(formatTimeInZone(new Date("2026-11-12T00:05:00Z"), "Europe/London")).toBe("12:05 am");
  });

  it("move to the next day when the zone is ahead of UTC", () => {
    expect(formatDayInZone(new Date("2026-11-11T23:30:00Z"), "Asia/Kolkata")).toBe("Thu 12 Nov");
  });
});

describe("isOutsideWorkingHours", () => {
  it("flags times before 8 am or from 7 pm local time", () => {
    expect(isOutsideWorkingHours(t, "America/New_York")).toBe(true); // 4:30 am
    expect(isOutsideWorkingHours(t, "Asia/Kolkata")).toBe(false); // 3:00 pm
    expect(isOutsideWorkingHours(new Date("2026-11-12T13:30:00Z"), "Asia/Kolkata")).toBe(true); // 7:00 pm
  });
});
