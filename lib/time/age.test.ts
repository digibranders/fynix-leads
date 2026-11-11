import { describe, expect, it } from "vitest";
import { formatWaiting, isOverdue } from "./age";

const now = new Date("2026-11-11T10:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatWaiting", () => {
  it("uses minutes under an hour", () => expect(formatWaiting(ago(12 * MIN), now)).toBe("12m"));
  it("uses hours under a day", () => expect(formatWaiting(ago(5 * HOUR + 10 * MIN), now)).toBe("5h"));
  it("uses days and hours under a week", () => expect(formatWaiting(ago(2 * DAY + 4 * HOUR), now)).toBe("2d 4h"));
  it("drops zero hours", () => expect(formatWaiting(ago(3 * DAY), now)).toBe("3d"));
  it("uses days only from a week", () => expect(formatWaiting(ago(9 * DAY + 5 * HOUR), now)).toBe("9d"));
  it("never shows a negative age", () => expect(formatWaiting(new Date(now.getTime() + HOUR), now)).toBe("0m"));
});

describe("isOverdue", () => {
  it("is true past 24 hours by default", () => {
    expect(isOverdue(ago(25 * HOUR), now)).toBe(true);
    expect(isOverdue(ago(23 * HOUR), now)).toBe(false);
  });
});
