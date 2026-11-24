import { describe, expect, it } from "vitest";
import { CAMPAIGN_STATUSES, campaignAuditAction, canMoveCampaign } from "./campaign-status";

describe("canMoveCampaign", () => {
  it.each([
    ["draft", "active"],
    ["active", "paused"],
    ["paused", "active"],
    ["active", "completed"],
    ["completed", "archived"],
    ["archived", "draft"],
    ["completed", "draft"],
    ["paused", "draft"],
    ["draft", "completed"],
  ] as const)("allows %s to %s", (from, to) => expect(canMoveCampaign(from, to)).toBe(true));

  it.each([
    ["draft", "paused"],
    ["completed", "active"],
    ["archived", "active"],
    ["archived", "completed"],
    ["active", "draft"],
    ["active", "active"],
  ] as const)("refuses %s to %s", (from, to) => expect(canMoveCampaign(from, to)).toBe(false));

  it("lets every status but archived be archived", () => {
    for (const from of CAMPAIGN_STATUSES.filter((status) => status !== "archived")) expect(canMoveCampaign(from, "archived"), from).toBe(true);
  });
});

describe("campaignAuditAction", () => {
  it("names the archive and the restore, and calls every other change an update", () => {
    expect(campaignAuditAction("active", "archived")).toBe("campaign.archive");
    expect(campaignAuditAction("archived", "draft")).toBe("campaign.restore");
    expect(campaignAuditAction("draft", "active")).toBe("campaign.update");
  });
});
