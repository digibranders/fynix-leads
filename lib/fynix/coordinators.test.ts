import { describe, expect, it } from "vitest";
import { filterCounts, filterCoordinators, parseCoordinatorFilter, coordinatorSubtitle, coordinatorsHref } from "@/lib/fynix/coordinators";

const rows = [
  { name: "Brightwater Leads", status: "active", agencyNames: ["Calder Bay Media"] },
  { name: "Northgate Outreach", status: "active", agencyNames: ["Ridgeline Partners"] },
  { name: "Old Coordinator", status: "archived", agencyNames: [] },
] as const;

describe("parseCoordinatorFilter", () => {
  it("is Active unless the query says archived", () => {
    expect(parseCoordinatorFilter("archived")).toBe("archived");
    for (const value of [undefined, "", "active", "ARCHIVED", "x"]) expect(parseCoordinatorFilter(value)).toBe("active");
  });
});

describe("filterCoordinators and filterCounts", () => {
  it("keeps the rows of one status", () => {
    expect(filterCoordinators(rows, "active", "").map((row) => row.name)).toEqual(["Brightwater Leads", "Northgate Outreach"]);
    expect(filterCoordinators(rows, "archived", "").map((row) => row.name)).toEqual(["Old Coordinator"]);
  });

  it("searches the coordinator name and its agencies' names without regard to case", () => {
    expect(filterCoordinators(rows, "active", "  NORTH ").map((row) => row.name)).toEqual(["Northgate Outreach"]);
    expect(filterCoordinators(rows, "active", "calder").map((row) => row.name)).toEqual(["Brightwater Leads"]);
    expect(filterCoordinators(rows, "active", "zzz")).toEqual([]);
  });

  it("counts both statuses", () => {
    expect(filterCounts(rows)).toEqual({ active: 2, archived: 1 });
  });
});

describe("coordinatorSubtitle", () => {
  it("counts agencies and campaigns, or says the invite is waiting", () => {
    expect(coordinatorSubtitle({ agencyCount: 1, campaignCount: 1, inviteWaiting: false })).toBe("1 agency, 1 campaign");
    expect(coordinatorSubtitle({ agencyCount: 2, campaignCount: 0, inviteWaiting: false })).toBe("2 agencies, 0 campaigns");
    expect(coordinatorSubtitle({ agencyCount: 0, campaignCount: 0, inviteWaiting: true })).toBe("Invite sent, not accepted yet");
  });
});

describe("coordinatorsHref", () => {
  it("leaves out whatever is the default", () => {
    expect(coordinatorsHref({})).toBe("/fynix/coordinators");
    expect(coordinatorsHref({ status: "active", q: "  " })).toBe("/fynix/coordinators");
  });

  it("keeps the filter and the search, and encodes them", () => {
    expect(coordinatorsHref({ status: "archived" })).toBe("/fynix/coordinators?status=archived");
    expect(coordinatorsHref({ q: " north & gate " })).toBe("/fynix/coordinators?q=north+%26+gate");
  });
});
