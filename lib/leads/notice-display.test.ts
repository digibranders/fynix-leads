import { describe, expect, it } from "vitest";
import { relativeTime, safeNoticeLink } from "./notice-display";

const now = new Date("2026-11-25T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("relativeTime", () => {
  it("reads in the unit that fits", () => {
    expect(relativeTime(ago(10_000), now)).toBe("Just now");
    expect(relativeTime(ago(5 * 60_000), now)).toBe("5 min ago");
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe("3 h ago");
    expect(relativeTime(ago(30 * 3_600_000), now)).toBe("Yesterday");
    expect(relativeTime(ago(4 * 86_400_000), now)).toBe("4 d ago");
    expect(relativeTime(ago(20 * 86_400_000), now)).toBe("5 Nov");
  });
  it("never reads from the future", () => {
    expect(relativeTime(new Date(now.getTime() + 60_000), now)).toBe("Just now");
  });
});

describe("safeNoticeLink", () => {
  it("accepts a path of the app and nothing else", () => {
    expect(safeNoticeLink("/client/leads/LEAD-ABCD")).toBe("/client/leads/LEAD-ABCD");
    expect(safeNoticeLink("//evil.example")).toBeNull();
    expect(safeNoticeLink("https://evil.example")).toBeNull();
  });
});
