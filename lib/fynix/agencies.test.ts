import { describe, expect, it } from "vitest";
import { agenciesHref, agencySubtitle, filterAgencies } from "@/lib/fynix/agencies";

const rows = [
  { name: "Ridgeway Partner", status: "active" as const, contactEmail: "hello@ridgeway.example", coordinator: { name: "Brightpath" } },
  { name: "Orrin Outreach", status: "active" as const, contactEmail: null, coordinator: { name: "Northgate" } },
  { name: "Old Agency", status: "archived" as const, contactEmail: null, coordinator: { name: "Brightpath" } },
];

describe("filterAgencies", () => {
  it("keeps the tab's status and matches the name, the contact email or the coordinator", () => {
    expect(filterAgencies(rows, "active", "").map((row) => row.name)).toEqual(["Ridgeway Partner", "Orrin Outreach"]);
    expect(filterAgencies(rows, "archived", "").map((row) => row.name)).toEqual(["Old Agency"]);
    expect(filterAgencies(rows, "active", " RIDGE ").map((row) => row.name)).toEqual(["Ridgeway Partner"]);
    expect(filterAgencies(rows, "active", "hello@").map((row) => row.name)).toEqual(["Ridgeway Partner"]);
    expect(filterAgencies(rows, "active", "northgate").map((row) => row.name)).toEqual(["Orrin Outreach"]);
  });
});

describe("agenciesHref", () => {
  it("leaves defaults out", () => {
    expect(agenciesHref({})).toBe("/fynix/agencies");
    expect(agenciesHref({ status: "active", q: "  " })).toBe("/fynix/agencies");
    expect(agenciesHref({ status: "archived", q: " ridge " })).toBe("/fynix/agencies?status=archived&q=ridge");
  });
});

describe("agencySubtitle", () => {
  it("names the coordinator, and a waiting invite", () => {
    expect(agencySubtitle({ coordinator: { name: "Brightpath" }, inviteWaiting: false })).toBe("Brightpath");
    expect(agencySubtitle({ coordinator: { name: "Brightpath" }, inviteWaiting: true })).toContain("Invite sent");
  });
});
