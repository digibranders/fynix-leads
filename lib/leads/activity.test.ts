import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "@/lib/domain/types";
import { dayHeading, groupActivity } from "./activity";

const ev = (id: string, at: string, kind: "human" | "system" = "human"): ActivityEvent => ({
  id,
  at,
  actor: kind === "system" ? "System" : "Client",
  kind,
  text: id,
});

describe("groupActivity", () => {
  it("returns nothing for no events", () => {
    expect(groupActivity([], "Europe/London")).toEqual([]);
  });

  it("orders newest first and labels each day in the viewer zone", () => {
    const groups = groupActivity(
      [ev("a", "2026-11-10T09:00:00Z"), ev("c", "2026-11-11T08:00:00Z"), ev("b", "2026-11-10T15:00:00Z")],
      "Europe/London",
    );
    expect(groups.map((g) => g.label)).toEqual(["Wed 11 Nov", "Tue 10 Nov"]);
    expect(groups[1].items.map((i) => (i.kind === "event" ? i.event.id : "system"))).toEqual(["b", "a"]);
  });

  it("puts an event on the next day when the viewer zone is ahead of UTC", () => {
    const groups = groupActivity([ev("late", "2026-11-11T23:30:00Z")], "Asia/Kolkata");
    expect(groups.map((g) => g.label)).toEqual(["Thu 12 Nov"]);
  });

  it("collapses consecutive system events into one item", () => {
    const groups = groupActivity(
      [
        ev("s1", "2026-11-11T08:00:00Z", "system"),
        ev("s2", "2026-11-11T08:01:00Z", "system"),
        ev("h", "2026-11-11T09:00:00Z"),
        ev("s3", "2026-11-11T10:00:00Z", "system"),
      ],
      "Europe/London",
    );
    const kinds = groups[0].items.map((i) => (i.kind === "system" ? `system:${i.events.length}` : i.event.id));
    expect(kinds).toEqual(["system:1", "h", "system:2"]);
  });

  it("does not collapse system events across a human event", () => {
    const groups = groupActivity(
      [ev("s1", "2026-11-11T08:00:00Z", "system"), ev("h", "2026-11-11T08:30:00Z"), ev("s2", "2026-11-11T09:00:00Z", "system")],
      "Europe/London",
    );
    expect(groups[0].items).toHaveLength(3);
  });

  it("keeps the input order when two events share a time", () => {
    const groups = groupActivity([ev("first", "2026-11-11T08:00:00Z"), ev("second", "2026-11-11T08:00:00Z")], "Europe/London");
    expect(groups[0].items.map((i) => (i.kind === "event" ? i.event.id : ""))).toEqual(["second", "first"]);
  });
});

describe("dayHeading", () => {
  const now = new Date("2026-11-11T10:00:00Z");

  it("calls the viewer's current day Today and keeps the date underneath", () => {
    expect(dayHeading(new Date("2026-11-11T08:20:00Z"), now, "Europe/London")).toEqual({ title: "Today", sub: "Wed 11 Nov" });
  });

  it("uses the short date for any other day", () => {
    expect(dayHeading(new Date("2026-11-10T13:30:00Z"), now, "Europe/London")).toEqual({ title: "Tue 10 Nov" });
  });

  it("compares days in the viewer zone, not in UTC", () => {
    // 23:30 UTC on the 10th is already the 11th in Kolkata, and now is the 11th there too.
    expect(dayHeading(new Date("2026-11-10T23:30:00Z"), now, "Asia/Kolkata").title).toBe("Today");
  });
});

describe("groupActivity day time", () => {
  it("carries the newest event time of each day so the heading can be built", () => {
    const groups = groupActivity([ev("a", "2026-11-10T09:00:00Z"), ev("b", "2026-11-10T15:00:00Z")], "Europe/London");
    expect(groups[0].at.toISOString()).toBe("2026-11-10T15:00:00.000Z");
  });
});
