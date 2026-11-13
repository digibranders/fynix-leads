import { describe, expect, it } from "vitest";
import { FYNIX_NAV, isCurrent } from "@/components/fynix/nav-config";

describe("FYNIX_NAV", () => {
  it("lists the nine items of the comps in order, and only Suppliers and Campaigns are links", () => {
    expect(FYNIX_NAV.map((item) => item.label)).toEqual(["Overview", "Clients", "Suppliers", "Campaigns", "Leads", "Meetings", "Inbox", "Disputes", "Settings"]);
    expect(FYNIX_NAV.filter((item) => item.href !== null).map((item) => item.href)).toEqual(["/fynix/suppliers", "/fynix/campaigns"]);
  });
});

describe("isCurrent", () => {
  it("matches the path and the paths below it, and nothing that only shares a prefix", () => {
    expect(isCurrent("/fynix/campaigns", "/fynix/campaigns")).toBe(true);
    expect(isCurrent("/fynix/campaigns", "/fynix/campaigns/CMP-7Q2X/hosts")).toBe(true);
    expect(isCurrent("/fynix/campaigns", "/fynix/campaigns-old")).toBe(false);
    expect(isCurrent("/fynix/suppliers", "/fynix/campaigns")).toBe(false);
  });
});
