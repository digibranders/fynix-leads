import { describe, expect, it } from "vitest";
import { filterLeads, paginate, parsePage } from "./list";

const lead = (publicRef: string, prospectName: string, prospectCompany: string, stage: string) => ({ publicRef, prospectName, prospectCompany, stage });
const LEADS = [
  lead("LD-3K7M", "Marta Lindqvist", "Nordvik Cold Chain", "awaiting_client"),
  lead("LD-8T4V", "Ingrid Sørensen", "Fjordline Distribution", "scheduled"),
  lead("LD-4B9C", "Priya Raman", "Greenfield Markets", "delivered"),
];

describe("filterLeads", () => {
  it("matches name, company and reference without regard to case", () => {
    expect(filterLeads(LEADS, { group: null, q: "marta" })).toHaveLength(1);
    expect(filterLeads(LEADS, { group: null, q: "GREENFIELD" })).toHaveLength(1);
    expect(filterLeads(LEADS, { group: null, q: "ld-8t4v" })).toHaveLength(1);
    expect(filterLeads(LEADS, { group: null, q: "  " })).toHaveLength(3);
  });

  it("combines a group with a search", () => {
    expect(filterLeads(LEADS, { group: "scheduled", q: "" })).toHaveLength(1);
    expect(filterLeads(LEADS, { group: "scheduled", q: "marta" })).toHaveLength(0);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 45 }, (_, index) => index);

  it("cuts a page and reports the range", () => {
    const page = paginate(items, 2, 20);
    expect(page.rows[0]).toBe(20);
    expect([page.from, page.to, page.total, page.pages]).toEqual([21, 40, 45, 3]);
  });

  it("clamps a page that is out of range or not a whole number", () => {
    expect(paginate(items, 99, 20).page).toBe(3);
    expect(paginate(items, 0, 20).page).toBe(1);
    expect(paginate(items, Number.NaN, 20).page).toBe(1);
    expect(paginate(items, 1.5, 20).page).toBe(1);
  });

  it("handles an empty list", () => {
    expect(paginate([], 1)).toMatchObject({ rows: [], from: 0, to: 0, total: 0, pages: 1 });
  });

  it("reads the page from the URL", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage(undefined)).toBe(1);
    expect(Number.isNaN(parsePage("abc"))).toBe(true);
  });
});
