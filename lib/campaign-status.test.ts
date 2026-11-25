import { describe, expect, it } from "vitest";
import { CAMPAIGN_STATUSES } from "@/lib/domain/campaign-status";
import { campaignBucket, campaignChoiceGroups, campaignFilterHrefs, campaignStatusLabel, campaignStatusTone, closedCampaignIds, countByTab, goLiveRefusal, inCampaignTab, isClosed, notLiveReason, parseCampaignFilter, parseCampaignTab, sumActiveCampaigns } from "./campaign-status";

describe("campaignBucket", () => {
  it("shows five statuses as three states", () => {
    expect(CAMPAIGN_STATUSES.map((status) => [status, campaignBucket(status)])).toEqual([
      ["draft", "setting-up"],
      ["active", "active"],
      ["paused", "closed"],
      ["completed", "closed"],
      ["archived", "closed"],
    ]);
  });

  it("labels and tones follow the bucket, and only closed statuses are closed", () => {
    expect(CAMPAIGN_STATUSES.map(campaignStatusLabel)).toEqual(["Setting up", "Active", "Closed", "Closed", "Closed"]);
    expect(CAMPAIGN_STATUSES.map(campaignStatusTone)).toEqual(["quiet", "green", "amber", "amber", "amber"]);
    expect(CAMPAIGN_STATUSES.filter(isClosed)).toEqual(["paused", "completed", "archived"]);
  });
});

describe("goLiveRefusal", () => {
  const ready = { agreed: true, clientAccepted: true, coordinatorAccepted: true, hasHost: true };

  it("lets a campaign with both acceptances and a host go live", () => expect(goLiveRefusal(ready)).toBeNull());

  it("names the side that has not accepted", () => {
    expect(goLiveRefusal({ ...ready, agreed: false, coordinatorAccepted: false })).toEqual({ code: "agreement-not-accepted", message: "The coordinator has not accepted the agreement yet." });
    expect(goLiveRefusal({ ...ready, agreed: false, clientAccepted: false })).toEqual({ code: "agreement-not-accepted", message: "The client has not accepted the agreement yet." });
    expect(goLiveRefusal({ ...ready, agreed: false, clientAccepted: false, coordinatorAccepted: false })?.message).toBe("Neither the client nor the coordinator has accepted the agreement yet.");
  });

  it("asks for a host only after the agreement, and refuses with no-host", () => {
    expect(goLiveRefusal({ ...ready, hasHost: false })).toEqual({ code: "no-host", message: "The campaign has no active host yet." });
    expect(goLiveRefusal({ agreed: false, clientAccepted: false, coordinatorAccepted: false, hasHost: false })?.code).toBe("agreement-not-accepted");
  });
});

describe("notLiveReason", () => {
  const ready = { agreed: true, clientAccepted: true, coordinatorAccepted: true, hasHost: true };

  it("is null for an active campaign and says why for the others", () => {
    expect(notLiveReason({ status: "active", ...ready })).toBeNull();
    expect(notLiveReason({ status: "draft", ...ready })).toBe("Fynix has not made it active yet.");
    expect(notLiveReason({ status: "draft", ...ready, hasHost: false })).toBe("The campaign has no active host yet.");
    expect(notLiveReason({ status: "draft", ...ready, agreed: false, clientAccepted: false })).toBe("The client has not accepted the agreement yet.");
    expect(notLiveReason({ status: "completed", ...ready })).toBe("The campaign is closed.");
  });
});

describe("sumActiveCampaigns", () => {
  it("adds targets and delivered leads of active campaigns only", () => {
    const rows = [
      { status: "active", monthlyTarget: 10, totalTarget: 60, delivered: 3 },
      { status: "draft", monthlyTarget: 5, totalTarget: 30, delivered: 0 },
      { status: "completed", monthlyTarget: 7, totalTarget: 40, delivered: 9 },
      { status: "active", monthlyTarget: 4, totalTarget: 20, delivered: 1 },
    ] as const;
    expect(sumActiveCampaigns(rows)).toEqual({ campaigns: 2, monthlyTarget: 14, totalTarget: 80, delivered: 4 });
    expect(sumActiveCampaigns([])).toEqual({ campaigns: 0, monthlyTarget: 0, totalTarget: 0, delivered: 0 });
  });
});

describe("campaign tabs and filter", () => {
  const rows = [
    { id: "a", name: "Zeta", status: "active" as const },
    { id: "b", name: "Alpha", status: "completed" as const },
    { id: "c", name: "Beta", status: "draft" as const },
    { id: "d", name: "Gamma", status: "active" as const },
    { id: "e", name: "Delta", status: "paused" as const },
  ];

  it("opens on Active unless the URL names another tab", () => {
    expect(parseCampaignTab(undefined)).toBe("active");
    expect(parseCampaignTab("bogus")).toBe("active");
    expect(parseCampaignTab("closed")).toBe("closed");
    expect(parseCampaignTab(["all", "closed"])).toBe("all");
  });

  it("counts and filters by tab", () => {
    expect(countByTab(rows)).toEqual({ active: 2, "setting-up": 1, closed: 2, all: 5 });
    expect(inCampaignTab(rows, "closed").map((row) => row.id)).toEqual(["b", "e"]);
    expect(inCampaignTab(rows, "all")).toHaveLength(5);
  });

  it("groups the filter with active first and closed below, each by name", () => {
    expect(campaignChoiceGroups(rows).map((group) => [group.label, group.items.map((item) => item.name)])).toEqual([
      ["Active", ["Gamma", "Zeta"]],
      ["Setting up", ["Beta"]],
      ["Closed", ["Alpha", "Delta"]],
    ]);
    expect(campaignChoiceGroups([])).toEqual([]);
  });

  it("trusts a campaign id only when the viewer can see it", () => {
    expect(parseCampaignFilter("b", rows)).toBe("b");
    expect(parseCampaignFilter("zzz", rows)).toBeNull();
    expect(parseCampaignFilter(undefined, rows)).toBeNull();
    expect([...closedCampaignIds(rows)].sort()).toEqual(["b", "e"]);
  });

  it("builds one address per campaign and one to clear the filter", () => {
    const made = campaignFilterHrefs(rows.slice(0, 2), (id) => (id === null ? "/x" : `/x?campaign=${id}`));
    expect(made).toEqual({ allHref: "/x", hrefs: { a: "/x?campaign=a", b: "/x?campaign=b" } });
  });
});
