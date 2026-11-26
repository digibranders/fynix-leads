import { describe, expect, it } from "vitest";
import { withDefaultHours } from "@/lib/leads/host-hours";
import { assertRange, freePeopleAt, freeSlotStarts, isSlotFree, mergeIntervals, type Interval, type PersonTime } from "./free-time";

const at = (iso: string): Date => new Date(iso);
const slot = (from: string, to: string): Interval => ({ start: at(from), end: at(to) });
const standardWeek = withDefaultHours({ timeZone: null, hours: [], blocks: [] }, "Europe/London");
const person = (over: Partial<PersonTime> = {}): PersonTime => ({ availability: standardWeek, busy: [], ...over });
// A Tuesday. The earliest bookable moment is 48 hours later: Thursday 2026-12-03 at 09:00 UTC. London is on UTC in December.
const NOW = at("2026-12-01T09:00:00Z");

describe("mergeIntervals", () => {
  it("sorts, joins overlapping and touching intervals and drops empty ones", () => {
    const merged = mergeIntervals([slot("2026-12-03T11:00:00Z", "2026-12-03T12:00:00Z"), slot("2026-12-03T09:00:00Z", "2026-12-03T10:00:00Z"), slot("2026-12-03T09:30:00Z", "2026-12-03T10:30:00Z"), slot("2026-12-03T10:30:00Z", "2026-12-03T10:45:00Z"), slot("2026-12-03T13:00:00Z", "2026-12-03T13:00:00Z")]);
    expect(merged.map((item) => [item.start.toISOString(), item.end.toISOString()])).toEqual([
      ["2026-12-03T09:00:00.000Z", "2026-12-03T10:45:00.000Z"],
      ["2026-12-03T11:00:00.000Z", "2026-12-03T12:00:00.000Z"],
    ]);
  });
});

describe("assertRange", () => {
  it("accepts up to 62 days and refuses more, an empty range and a backwards one", () => {
    expect(() => assertRange(slot("2026-12-01T00:00:00Z", "2027-02-01T00:00:00Z"))).not.toThrow();
    expect(() => assertRange(slot("2026-12-01T00:00:00Z", "2027-02-02T00:00:00Z"))).toThrow(RangeError);
    expect(() => assertRange(slot("2026-12-01T00:00:00Z", "2026-12-01T00:00:00Z"))).toThrow(RangeError);
    expect(() => assertRange(slot("2026-12-02T00:00:00Z", "2026-12-01T00:00:00Z"))).toThrow(RangeError);
  });
});

describe("isSlotFree", () => {
  it("is free inside working hours once the notice has passed", () => {
    expect(isSlotFree(slot("2026-12-03T10:00:00Z", "2026-12-03T10:30:00Z"), person(), NOW)).toBe(true);
  });

  it("is not free sooner than 48 hours from now", () => {
    expect(isSlotFree(slot("2026-12-02T10:00:00Z", "2026-12-02T10:30:00Z"), person(), NOW)).toBe(false);
    expect(isSlotFree(slot("2026-12-03T09:00:00Z", "2026-12-03T09:30:00Z"), person(), NOW)).toBe(true);
  });

  it("is not free when it starts before the hours begin or runs past the hours end", () => {
    expect(isSlotFree(slot("2026-12-03T08:30:00Z", "2026-12-03T09:00:00Z"), person(), NOW)).toBe(false);
    expect(isSlotFree(slot("2026-12-03T16:45:00Z", "2026-12-03T17:15:00Z"), person(), NOW)).toBe(false);
    expect(isSlotFree(slot("2026-12-03T16:30:00Z", "2026-12-03T17:00:00Z"), person(), NOW)).toBe(true);
  });

  it("is not free on a day off", () => {
    expect(isSlotFree(slot("2026-12-05T10:00:00Z", "2026-12-05T10:30:00Z"), person(), NOW)).toBe(false);
  });

  it("is not free when it overlaps busy time, but touching it is fine", () => {
    const busy = [slot("2026-12-03T10:15:00Z", "2026-12-03T10:45:00Z")];
    expect(isSlotFree(slot("2026-12-03T10:00:00Z", "2026-12-03T10:30:00Z"), person({ busy }), NOW)).toBe(false);
    expect(isSlotFree(slot("2026-12-03T10:30:00Z", "2026-12-03T11:00:00Z"), person({ busy }), NOW)).toBe(false);
    expect(isSlotFree(slot("2026-12-03T10:45:00Z", "2026-12-03T11:15:00Z"), person({ busy }), NOW)).toBe(true);
    expect(isSlotFree(slot("2026-12-03T09:30:00Z", "2026-12-03T10:15:00Z"), person({ busy }), NOW)).toBe(true);
  });

  it("is not free when a blocked time falls in the middle of it", () => {
    const blocked = { ...standardWeek, blocks: [{ startsAt: at("2026-12-03T10:10:00Z"), endsAt: at("2026-12-03T10:20:00Z") }] };
    expect(isSlotFree(slot("2026-12-03T10:00:00Z", "2026-12-03T10:30:00Z"), person({ availability: blocked }), NOW)).toBe(false);
  });

  it("reads the hours in the person's zone across the day the clocks change", () => {
    const now = at("2027-03-20T00:00:00Z");
    // London moves to summer time on 2027-03-28, so on Monday the 29th 09:00 local is 08:00 UTC.
    expect(isSlotFree(slot("2027-03-29T08:00:00Z", "2027-03-29T08:30:00Z"), person(), now)).toBe(true);
    expect(isSlotFree(slot("2027-03-29T07:30:00Z", "2027-03-29T08:00:00Z"), person(), now)).toBe(false);
    expect(isSlotFree(slot("2027-03-29T15:30:00Z", "2027-03-29T16:00:00Z"), person(), now)).toBe(true);
    expect(isSlotFree(slot("2027-03-29T16:00:00Z", "2027-03-29T16:30:00Z"), person(), now)).toBe(false);
  });
});

describe("freeSlotStarts", () => {
  const thursday = slot("2026-12-03T00:00:00Z", "2026-12-04T00:00:00Z");

  it("lists every half hour of a working day, from 09:00 to 16:30", () => {
    const starts = freeSlotStarts(thursday, 30, person(), NOW);
    expect(starts).toHaveLength(16);
    expect(starts[0]?.toISOString()).toBe("2026-12-03T09:00:00.000Z");
    expect(starts[15]?.toISOString()).toBe("2026-12-03T16:30:00.000Z");
  });

  it("leaves out the half hours that touch busy time", () => {
    const starts = freeSlotStarts(thursday, 30, person({ busy: [slot("2026-12-03T12:00:00Z", "2026-12-03T13:00:00Z")] }), NOW);
    expect(starts).toHaveLength(14);
    expect(starts.map((start) => start.toISOString())).not.toContain("2026-12-03T12:00:00.000Z");
    expect(starts.map((start) => start.toISOString())).not.toContain("2026-12-03T12:30:00.000Z");
    expect(starts.map((start) => start.toISOString())).toContain("2026-12-03T13:00:00.000Z");
  });

  it("starts at the notice limit when the range begins sooner", () => {
    const friday = slot("2026-12-04T00:00:00Z", "2026-12-05T00:00:00Z");
    const starts = freeSlotStarts(friday, 30, person(), at("2026-12-02T12:00:00Z"));
    expect(starts[0]?.toISOString()).toBe("2026-12-04T12:00:00.000Z");
  });

  it("refuses a range over 62 days", () => {
    expect(() => freeSlotStarts(slot("2026-12-01T00:00:00Z", "2027-02-02T00:00:00Z"), 30, person(), NOW)).toThrow(RangeError);
  });
});

describe("freePeopleAt", () => {
  it("returns the people who are free then", () => {
    const people = [
      { memberId: "a", ...person({ busy: [slot("2026-12-03T10:00:00Z", "2026-12-03T10:30:00Z")] }) },
      { memberId: "b", ...person() },
    ];
    expect(freePeopleAt(slot("2026-12-03T10:00:00Z", "2026-12-03T10:30:00Z"), people, NOW)).toEqual(["b"]);
    expect(freePeopleAt(slot("2026-12-03T11:00:00Z", "2026-12-03T11:30:00Z"), people, NOW)).toEqual(["a", "b"]);
  });
});
