import { describe, expect, it } from "vitest";
import { barPercent, pillCount, progressTicks } from "./progress";

describe("progressTicks", () => {
  it("marks every full month below the target", () => {
    expect(progressTicks(72, 12)).toEqual([12, 24, 36, 48, 60]);
  });
  it("has no tick when the target is within one month", () => {
    expect(progressTicks(12, 12)).toEqual([]);
    expect(progressTicks(10, 12)).toEqual([]);
  });
  it("has no ticks and does not hang for a zero, negative or invalid target", () => {
    for (const [total, monthly] of [[72, 0], [0, 12], [0, 0], [-5, 12], [72, -3], [Number.NaN, 12], [72, Number.NaN], [Infinity, 12]]) {
      expect(progressTicks(total, monthly)).toEqual([]);
    }
  });
});

describe("barPercent", () => {
  it("is the share of the total, capped to the bar", () => {
    expect(barPercent(18, 72)).toBe(25);
    expect(barPercent(90, 72)).toBe(100);
    expect(barPercent(-1, 72)).toBe(0);
  });
  it("is 0 when the total is not positive", () => {
    expect(barPercent(5, 0)).toBe(0);
    expect(barPercent(5, -2)).toBe(0);
    expect(barPercent(5, Number.NaN)).toBe(0);
  });
});

describe("pillCount", () => {
  it("is a whole non-negative count", () => {
    expect(pillCount(12)).toBe(12);
    expect(pillCount(2.7)).toBe(2);
    expect(pillCount(0)).toBe(0);
    expect(pillCount(-4)).toBe(0);
    expect(pillCount(Number.NaN)).toBe(0);
    expect(pillCount(Infinity)).toBe(0);
  });
});
