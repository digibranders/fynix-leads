import { describe, expect, it } from "vitest";
import { dayField, parseHoursGrid, parseTime, rangeField, timeValue } from "@/lib/fynix/hours-form";

const grid = (entries: Record<string, string>) => parseHoursGrid((name) => entries[name] ?? "");

describe("parseTime and timeValue", () => {
  it("reads a time input value as minutes and back", () => {
    expect(parseTime("09:00", false)).toBe(540);
    expect(parseTime("00:00", false)).toBe(0);
    expect(parseTime("17:30", true)).toBe(1050);
    expect(parseTime("23:59", true)).toBe(1440);
    expect(parseTime("23:59", false)).toBe(1439);
    for (const bad of ["", "9:00", "24:00", "12:60", "ab:cd"]) expect(parseTime(bad, false), bad).toBeNull();
    expect(timeValue(540)).toBe("09:00");
    expect(timeValue(1440)).toBe("23:59");
    expect(timeValue(0)).toBe("00:00");
  });
});

describe("parseHoursGrid", () => {
  it("reads ranges per day, skips empty ones and keeps a split day in order", () => {
    const result = grid({
      [rangeField(1, 0, "from")]: "09:00", [rangeField(1, 0, "to")]: "17:00",
      [rangeField(3, 1, "from")]: "14:00", [rangeField(3, 1, "to")]: "17:00",
      [rangeField(3, 0, "from")]: "09:00", [rangeField(3, 0, "to")]: "12:00",
      [rangeField(5, 0, "from")]: "", [rangeField(5, 0, "to")]: "",
    });
    expect(result.errors).toEqual({});
    expect(result.windows).toEqual([
      { weekday: 1, startMinute: 540, endMinute: 1020 },
      { weekday: 3, startMinute: 540, endMinute: 720 },
      { weekday: 3, startMinute: 840, endMinute: 1020 },
    ]);
  });

  it("gives an empty set when nothing is filled in", () => {
    expect(grid({})).toEqual({ windows: [], errors: {} });
  });

  it("says which day has a half-filled range, a backwards range or an overlap", () => {
    const result = grid({
      [rangeField(1, 0, "from")]: "09:00",
      [rangeField(2, 0, "from")]: "17:00", [rangeField(2, 0, "to")]: "09:00",
      [rangeField(4, 0, "from")]: "09:00", [rangeField(4, 0, "to")]: "12:00",
      [rangeField(4, 1, "from")]: "11:00", [rangeField(4, 1, "to")]: "14:00",
    });
    expect(result.errors).toEqual({
      [dayField(1)]: "Monday: enter both a start and an end.",
      [dayField(2)]: "Tuesday: the end must be after the start.",
      [dayField(4)]: "Thursday: ranges must not overlap.",
    });
  });

  it("allows a range to start the minute another ends", () => {
    const result = grid({
      [rangeField(0, 0, "from")]: "09:00", [rangeField(0, 0, "to")]: "12:00",
      [rangeField(0, 1, "from")]: "12:00", [rangeField(0, 1, "to")]: "15:00",
    });
    expect(result.errors).toEqual({});
    expect(result.windows).toHaveLength(2);
  });
});
