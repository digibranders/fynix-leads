import { describe, expect, it } from "vitest";
import { isOutsideHostHours, proposedTimeWarnings, quarterHourSlotsForHost, type HostAvailability } from "./host-hours";

/** Monday to Friday, 09:00 to 17:00 in London, with one blocked afternoon. 2027-01-04 is a Monday. */
const availability: HostAvailability = {
  timeZone: "Europe/London",
  hours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1020 })),
  blocks: [{ startsAt: new Date("2027-01-05T14:00:00Z"), endsAt: new Date("2027-01-05T16:00:00Z") }],
};

describe("isOutsideHostHours", () => {
  it("is false inside a weekly window, in the host's zone", () => {
    expect(isOutsideHostHours(new Date("2027-01-04T09:00:00Z"), availability)).toBe(false);
    expect(isOutsideHostHours(new Date("2027-01-04T16:45:00Z"), availability)).toBe(false);
  });

  it("is true before the start, at the end and on a day with no window", () => {
    expect(isOutsideHostHours(new Date("2027-01-04T08:45:00Z"), availability)).toBe(true);
    expect(isOutsideHostHours(new Date("2027-01-04T17:00:00Z"), availability)).toBe(true);
    expect(isOutsideHostHours(new Date("2027-01-09T10:00:00Z"), availability)).toBe(true);
  });

  it("reads the time in the host's zone, not in UTC", () => {
    const newYork: HostAvailability = { ...availability, timeZone: "America/New_York" };
    expect(isOutsideHostHours(new Date("2027-01-04T14:00:00Z"), newYork)).toBe(false);
    expect(isOutsideHostHours(new Date("2027-01-04T09:00:00Z"), newYork)).toBe(true);
  });

  it("is true inside a blocked time", () => {
    expect(isOutsideHostHours(new Date("2027-01-05T15:00:00Z"), availability)).toBe(true);
    expect(isOutsideHostHours(new Date("2027-01-05T16:00:00Z"), availability)).toBe(false);
  });

  it("is true when the host has set no hours", () => {
    expect(isOutsideHostHours(new Date("2027-01-04T10:00:00Z"), { timeZone: null, hours: [], blocks: [] })).toBe(true);
  });
});

describe("quarterHourSlotsForHost", () => {
  it("lists every quarter hour of the window on the host's day, ending before the window ends", () => {
    const slots = quarterHourSlotsForHost("2027-01-04", availability);
    expect(slots).toHaveLength(32);
    expect(slots[0]?.toISOString()).toBe("2027-01-04T09:00:00.000Z");
    expect(slots.at(-1)?.toISOString()).toBe("2027-01-04T16:45:00.000Z");
  });

  it("leaves out blocked quarters and times before notBefore", () => {
    const slots = quarterHourSlotsForHost("2027-01-05", availability, { notBefore: new Date("2027-01-05T10:00:00Z") });
    expect(slots[0]?.toISOString()).toBe("2027-01-05T10:00:00.000Z");
    expect(slots.some((slot) => slot.toISOString() === "2027-01-05T14:00:00.000Z")).toBe(false);
    expect(slots.some((slot) => slot.toISOString() === "2027-01-05T15:45:00.000Z")).toBe(false);
    expect(slots.some((slot) => slot.toISOString() === "2027-01-05T16:00:00.000Z")).toBe(true);
  });

  it("follows the host's zone through the offset, and returns nothing on a day off", () => {
    const newYork: HostAvailability = { ...availability, timeZone: "America/New_York" };
    expect(quarterHourSlotsForHost("2027-01-04", newYork)[0]?.toISOString()).toBe("2027-01-04T14:00:00.000Z");
    expect(quarterHourSlotsForHost("2027-01-03", availability)).toEqual([]);
  });
});

describe("proposedTimeWarnings", () => {
  it("warns for a time outside the hours and one inside a block, and for nothing else", () => {
    const warnings = proposedTimeWarnings(
      [new Date("2027-01-04T10:00:00Z"), new Date("2027-01-04T20:00:00Z"), new Date("2027-01-05T15:00:00Z")],
      availability,
    );
    expect(warnings.map((entry) => [entry.time, entry.code])).toEqual([
      ["2027-01-04T20:00:00.000Z", "outside_host_hours"],
      ["2027-01-05T15:00:00.000Z", "host_blocked"],
    ]);
  });

  it("gives one warning when the host has not set any hours", () => {
    const warnings = proposedTimeWarnings([new Date("2027-01-04T10:00:00Z"), new Date("2027-01-04T11:00:00Z")], { timeZone: null, hours: [], blocks: [] });
    expect(warnings.map((entry) => entry.code)).toEqual(["no_host_hours"]);
  });
});
