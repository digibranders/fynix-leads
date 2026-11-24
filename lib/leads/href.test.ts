import { describe, expect, it } from "vitest";
import { leadsHref } from "./href";

describe("leadsHref", () => {
  it("leaves out empty filters", () => {
    expect(leadsHref("/client/leads", {})).toBe("/client/leads");
    expect(leadsHref("/client/leads", { stage: null, q: "  ", page: 1 })).toBe("/client/leads");
  });

  it("keeps a stage, a trimmed search and a page after the first", () => {
    expect(leadsHref("/client/leads", { stage: "due", q: " marta ", page: 3 })).toBe("/client/leads?stage=due&q=marta&page=3");
  });

  it("encodes the search", () => {
    expect(leadsHref("/x", { q: "a&b" })).toBe("/x?q=a%26b");
  });

  it("keeps the campaign, before the page", () => {
    expect(leadsHref("/x", { stage: "due", campaign: "c1", page: 2 })).toBe("/x?stage=due&campaign=c1&page=2");
    expect(leadsHref("/x", { campaign: null })).toBe("/x");
  });
});
