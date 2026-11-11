import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "@/lib/domain/types";
import { groupActivity } from "./activity";

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
