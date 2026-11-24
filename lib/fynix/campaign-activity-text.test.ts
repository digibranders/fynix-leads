import { describe, expect, it } from "vitest";
import { activityLine } from "./campaign-activity-text";

const base = { leadRef: null, fromStage: null, toStage: null, note: null } as const;

describe("activityLine", () => {
  it("names an audit action in words", () => {
    expect(activityLine({ ...base, source: "audit", action: "campaign.close" })).toEqual({ title: "Campaign closed", detail: null });
  });

  it("describes a lead step with its stage change and note", () => {
    expect(activityLine({ source: "lead", action: "client_review", leadRef: "LD-1", fromStage: "awaiting_client", toStage: "scheduled", note: " Looks right " })).toEqual({
      title: "Lead LD-1: Client review",
      detail: "Awaiting client to Scheduled. Looks right",
    });
  });

  it("says Now when the stage did not change, and has no detail when there is nothing to add", () => {
    expect(activityLine({ source: "lead", action: "submit", leadRef: "LD-2", fromStage: null, toStage: "awaiting_client", note: null }).detail).toBe("Now Awaiting client");
    expect(activityLine({ source: "lead", action: "note", leadRef: "LD-3", fromStage: null, toStage: null, note: null }).detail).toBeNull();
  });
});
