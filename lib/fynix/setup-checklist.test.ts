import { describe, expect, it } from "vitest";
import { checklistItems, checklistTitle } from "@/lib/fynix/setup-checklist";

describe("checklistItems", () => {
  it("links each finding to the page that fixes it", () => {
    const items = checklistItems({
      clientsWithoutManager: [{ name: "Kestrel Ledger", ref: "ORG-K1AA" }],
      coordinatorsWithoutManager: [{ name: "Northgate", ref: "ORG-N7GT" }],
      agenciesWithoutManager: [{ name: "Ridgeway Partner", ref: "ORG-R1DG" }],
      campaignsWithoutHost: [{ name: "UK finance", ref: "CMP-7Q2X" }],
      agreementsWaiting: [{ campaignName: "UK finance", ref: "CMP-7Q2X", party: "supplier" }],
    });
    expect(items.map((item) => item.href)).toEqual(["/fynix/clients/ORG-K1AA/people", "/fynix/coordinators/ORG-N7GT/people", "/fynix/agencies/ORG-R1DG/people", "/fynix/campaigns/CMP-7Q2X/hosts", "/fynix/campaigns/CMP-7Q2X/agreements"]);
    expect(items[4]?.label).toContain("coordinator has not accepted");
    expect(new Set(items.map((item) => item.key)).size).toBe(5);
    expect(checklistTitle(items)).toBe("5 things to set up");
  });

  it("is empty and says so when nothing is open", () => {
    const items = checklistItems({ clientsWithoutManager: [], coordinatorsWithoutManager: [], agenciesWithoutManager: [], campaignsWithoutHost: [], agreementsWaiting: [] });
    expect(items).toEqual([]);
    expect(checklistTitle(items)).toBe("Everything is set up");
  });
});
