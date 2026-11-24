import { describe, expect, it } from "vitest";
import { campaignCountsText, tallyCampaigns } from "@/lib/fynix/campaign-counts";

describe("tallyCampaigns", () => {
  it("counts draft as setting up, active as active and the rest as closed", () => {
    expect(tallyCampaigns(["draft", "active", "active", "paused", "completed", "archived"])).toEqual({ setup: 1, active: 2, closed: 3 });
    expect(tallyCampaigns([])).toEqual({ setup: 0, active: 0, closed: 0 });
  });
});

describe("campaignCountsText", () => {
  it("writes the non-zero parts in a fixed order", () => {
    expect(campaignCountsText({ setup: 0, active: 2, closed: 1 })).toBe("2 active, 1 closed");
    expect(campaignCountsText({ setup: 1, active: 1, closed: 0 })).toBe("1 active, 1 setting up");
    expect(campaignCountsText({ setup: 1, active: 0, closed: 0 })).toBe("1 setting up");
    expect(campaignCountsText({ setup: 0, active: 0, closed: 0 })).toBe("None yet");
  });
});
