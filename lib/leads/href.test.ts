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
});
