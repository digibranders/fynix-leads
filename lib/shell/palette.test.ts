import { describe, expect, it } from "vitest";
import { matchPages, resultGroups, shouldSearchServer } from "./palette";

describe("palette rules", () => {
  it("asks the server from two characters", () => {
    expect(shouldSearchServer("a")).toBe(false);
    expect(shouldSearchServer("  a ")).toBe(false);
    expect(shouldSearchServer("ab")).toBe(true);
  });

  it("matches pages by label, ignoring case", () => {
    const pages = [{ label: "Leads" }, { label: "Meetings" }, { label: "Team" }];
    expect(matchPages(pages, "")).toHaveLength(3);
    expect(matchPages(pages, "MEET")).toEqual([{ label: "Meetings" }]);
    expect(matchPages(pages, "zzz")).toEqual([]);
  });

  it("orders the groups leads, people, companies and drops the empty ones", () => {
    const hit = { label: "x", detail: null, href: "/x" };
    expect(resultGroups(null)).toEqual([]);
    expect(resultGroups({ leads: [hit], people: [], companies: [hit] }).map((group) => group.heading)).toEqual(["Leads", "Companies"]);
    expect(resultGroups({ leads: [], people: [], companies: [] })).toEqual([]);
  });
});
