import { describe, expect, it } from "vitest";
import { showsJoinBlock, stayText } from "./who-joined";

describe("stayText", () => {
  it.each([
    [0, "Under a minute"],
    [29, "Under a minute"],
    [30, "1 minute"],
    [89, "1 minute"],
    [1380, "23 minutes"],
  ])("%i seconds is %s", (seconds, text) => expect(stayText(seconds)).toBe(text));
});

describe("showsJoinBlock", () => {
  const now = new Date("2026-11-24T12:00:00Z");
  it("is shown once the meeting has started, and not before, nor for a cancelled one, nor without a meeting", () => {
    expect(showsJoinBlock({ scheduledStartTime: new Date("2026-11-24T09:00:00Z"), outcome: "held" }, now)).toBe(true);
    expect(showsJoinBlock({ scheduledStartTime: "2026-11-24T12:00:00Z", outcome: "scheduled" }, now)).toBe(true);
    expect(showsJoinBlock({ scheduledStartTime: new Date("2026-11-26T09:00:00Z"), outcome: "scheduled" }, now)).toBe(false);
    expect(showsJoinBlock({ scheduledStartTime: new Date("2026-11-24T09:00:00Z"), outcome: "cancelled" }, now)).toBe(false);
    expect(showsJoinBlock(null, now)).toBe(false);
  });
});
