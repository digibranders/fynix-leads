import { describe, expect, it } from "vitest";
import { nextSortValue, parseSort, sortRows, sortValue } from "./sort";

describe("sort in the URL", () => {
  it("reads a key, a descending key and ignores the rest", () => {
    expect(parseSort("prospect")).toEqual({ key: "prospect", dir: "asc" });
    expect(parseSort("-submitted")).toEqual({ key: "submitted", dir: "desc" });
    expect(parseSort("password")).toBeNull();
    expect(parseSort(undefined)).toBeNull();
  });
  it("flips the current column and starts a new one ascending", () => {
    expect(nextSortValue(null, "stage")).toBe("stage");
    expect(nextSortValue({ key: "stage", dir: "asc" }, "stage")).toBe("-stage");
    expect(nextSortValue({ key: "stage", dir: "desc" }, "stage")).toBe("stage");
    expect(nextSortValue({ key: "stage", dir: "asc" }, "company")).toBe("company");
    expect(sortValue({ key: "meeting", dir: "desc" })).toBe("-meeting");
    expect(sortValue(null)).toBeUndefined();
  });
});

describe("sortRows", () => {
  const rows = [
    { id: 1, name: "bea", at: 30 as number | null },
    { id: 2, name: "Ada", at: null },
    { id: 3, name: "cy", at: 10 },
  ];
  const cells = { prospect: (r: (typeof rows)[number]) => r.name, meeting: (r: (typeof rows)[number]) => r.at };
  it("sorts text ignoring case and keeps the input when there is no sort", () => {
    expect(sortRows(rows, { key: "prospect", dir: "asc" }, cells).map((r) => r.id)).toEqual([2, 1, 3]);
    expect(sortRows(rows, { key: "prospect", dir: "desc" }, cells).map((r) => r.id)).toEqual([3, 1, 2]);
    expect(sortRows(rows, null, cells).map((r) => r.id)).toEqual([1, 2, 3]);
  });
  it("puts empty cells last in both directions", () => {
    expect(sortRows(rows, { key: "meeting", dir: "asc" }, cells).map((r) => r.id)).toEqual([3, 1, 2]);
    expect(sortRows(rows, { key: "meeting", dir: "desc" }, cells).map((r) => r.id)).toEqual([1, 3, 2]);
  });
});

describe("the leads table's columns", () => {
  it("sorts by stage label, company and meeting time, with no meeting last", async () => {
    const { LEAD_SORT_CELLS } = await import("./lead-sort");
    const rows = [
      { id: 1, stage: "scheduled", prospectName: "B", prospectCompany: "Zed", submittedAt: "2026-11-01T00:00:00Z", scheduledMeetingTime: null },
      { id: 2, stage: "accepted", prospectName: "A", prospectCompany: "Acme", submittedAt: "2026-11-03T00:00:00Z", scheduledMeetingTime: "2026-11-10T09:00:00Z" },
    ];
    expect(sortRows(rows, { key: "stage", dir: "asc" }, LEAD_SORT_CELLS).map((r) => r.id)).toEqual([2, 1]);
    expect(sortRows(rows, { key: "company", dir: "desc" }, LEAD_SORT_CELLS).map((r) => r.id)).toEqual([1, 2]);
    expect(sortRows(rows, { key: "meeting", dir: "desc" }, LEAD_SORT_CELLS).map((r) => r.id)).toEqual([2, 1]);
    expect(sortRows(rows, { key: "submitted", dir: "asc" }, LEAD_SORT_CELLS).map((r) => r.id)).toEqual([1, 2]);
  });
});
