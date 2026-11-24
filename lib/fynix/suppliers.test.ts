import { describe, expect, it } from "vitest";
import { filterCounts, filterSuppliers, parseSupplierFilter, supplierSubtitle, suppliersHref } from "@/lib/fynix/suppliers";

const rows = [
  { name: "Brightwater Leads", status: "active", agencyNames: ["Calder Bay Media"] },
  { name: "Northgate Outreach", status: "active", agencyNames: ["Ridgeline Partners"] },
  { name: "Old Coordinator", status: "archived", agencyNames: [] },
] as const;

describe("parseSupplierFilter", () => {
  it("is Active unless the query says archived", () => {
    expect(parseSupplierFilter("archived")).toBe("archived");
    for (const value of [undefined, "", "active", "ARCHIVED", "x"]) expect(parseSupplierFilter(value)).toBe("active");
  });
});

describe("filterSuppliers and filterCounts", () => {
  it("keeps the rows of one status", () => {
    expect(filterSuppliers(rows, "active", "").map((row) => row.name)).toEqual(["Brightwater Leads", "Northgate Outreach"]);
    expect(filterSuppliers(rows, "archived", "").map((row) => row.name)).toEqual(["Old Coordinator"]);
  });

  it("searches the coordinator name and its agencies' names without regard to case", () => {
    expect(filterSuppliers(rows, "active", "  NORTH ").map((row) => row.name)).toEqual(["Northgate Outreach"]);
    expect(filterSuppliers(rows, "active", "calder").map((row) => row.name)).toEqual(["Brightwater Leads"]);
    expect(filterSuppliers(rows, "active", "zzz")).toEqual([]);
  });

  it("counts both statuses", () => {
    expect(filterCounts(rows)).toEqual({ active: 2, archived: 1 });
  });
});

describe("supplierSubtitle", () => {
  it("counts agencies and campaigns, or says the invite is waiting", () => {
    expect(supplierSubtitle({ agencyCount: 1, campaignCount: 1, inviteWaiting: false })).toBe("1 agency, 1 campaign");
    expect(supplierSubtitle({ agencyCount: 2, campaignCount: 0, inviteWaiting: false })).toBe("2 agencies, 0 campaigns");
    expect(supplierSubtitle({ agencyCount: 0, campaignCount: 0, inviteWaiting: true })).toBe("Invite sent, not accepted yet");
  });
});

describe("suppliersHref", () => {
  it("leaves out whatever is the default", () => {
    expect(suppliersHref({})).toBe("/fynix/suppliers");
    expect(suppliersHref({ status: "active", q: "  ", supplier: "" })).toBe("/fynix/suppliers");
  });

  it("keeps the filter, the search and the selection, and encodes them", () => {
    expect(suppliersHref({ status: "archived", supplier: "ORG-N7GT" })).toBe("/fynix/suppliers?status=archived&supplier=ORG-N7GT");
    expect(suppliersHref({ q: " north & gate ", supplier: "ORG-N7GT" })).toBe("/fynix/suppliers?q=north+%26+gate&supplier=ORG-N7GT");
  });
});
