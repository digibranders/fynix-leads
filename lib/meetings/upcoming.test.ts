import { describe, expect, it } from "vitest";
import { upcomingMeetings } from "./upcoming";

const now = new Date("2026-11-25T12:00:00Z");
const row = (id: string, outcome: string, at: string, campaignId = "c1") => ({ id, outcome, scheduledStartTime: new Date(at), campaignId });

describe("upcomingMeetings", () => {
  it("keeps booked meetings still to come on active campaigns, soonest first", () => {
    const rows = [row("late", "scheduled", "2026-12-01T10:00:00Z"), row("past", "scheduled", "2026-11-24T10:00:00Z"), row("held", "held", "2026-11-30T10:00:00Z"), row("closed", "scheduled", "2026-11-28T10:00:00Z", "c2"), row("soon", "scheduled", "2026-11-26T10:00:00Z")];
    expect(upcomingMeetings(rows, new Set(["c1"]), now).map((r) => r.id)).toEqual(["soon", "late"]);
  });
  it("cuts the list at the limit", () => {
    const rows = [1, 2, 3, 4, 5].map((n) => row(String(n), "scheduled", `2026-12-0${n}T10:00:00Z`));
    expect(upcomingMeetings(rows, new Set(["c1"]), now, 3)).toHaveLength(3);
  });
});
