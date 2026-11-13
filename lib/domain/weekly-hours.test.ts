import { describe, expect, it } from "vitest";
import { findHoursProblem, sortWindows } from "@/lib/domain/weekly-hours";

const slot = (weekday: number, startMinute: number, endMinute: number) => ({ weekday, startMinute, endMinute });

describe("findHoursProblem", () => {
  it("accepts an empty set, one window, several windows on a day and adjacent windows", () => {
    expect(findHoursProblem([])).toBeNull();
    expect(findHoursProblem([slot(1, 540, 1020)])).toBeNull();
    expect(findHoursProblem([slot(1, 540, 720), slot(1, 780, 1020), slot(2, 0, 1440)])).toBeNull();
    expect(findHoursProblem([slot(1, 540, 720), slot(1, 720, 1020)])).toBeNull();
  });

  it.each([
    ["a weekday past 6", [slot(7, 540, 600)], "weekday"],
    ["a negative weekday", [slot(-1, 540, 600)], "weekday"],
    ["a fractional weekday", [slot(1.5, 540, 600)], "weekday"],
    ["a start below 0", [slot(1, -1, 600)], "minutes"],
    ["an end past 1440", [slot(1, 540, 1441)], "minutes"],
    ["a fractional minute", [slot(1, 540.5, 600)], "minutes"],
    ["a window that ends where it starts", [slot(1, 600, 600)], "start before it ends"],
    ["a window that ends before it starts", [slot(1, 700, 600)], "start before it ends"],
    ["two windows that overlap, given out of order", [slot(1, 700, 800), slot(1, 540, 720)], "overlap"],
    ["one window inside another", [slot(3, 540, 1020), slot(3, 600, 660)], "overlap"],
  ])("finds %s", (_label, windows, fragment) => {
    expect(findHoursProblem(windows)).toContain(fragment);
  });

  it("does not quote the values it was given", () => {
    expect(findHoursProblem([slot(7, 123457, 600)])).not.toContain("123457");
  });
});

describe("sortWindows", () => {
  it("orders by weekday then start, and leaves its input alone", () => {
    const input = [slot(2, 600, 700), slot(1, 900, 1000), slot(1, 540, 600)];
    expect(sortWindows(input)).toEqual([slot(1, 540, 600), slot(1, 900, 1000), slot(2, 600, 700)]);
    expect(input[0]).toEqual(slot(2, 600, 700));
  });
});
