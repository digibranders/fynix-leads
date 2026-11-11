import { describe, expect, it } from "vitest";
import type { ApprovalStatus } from "@/lib/domain/status";
import { SAMPLE_LEADS } from "@/lib/sample/data";
import { filterLeads, sortLeads, toggleSort } from "./filter";

type Row = { ref: string; approval: ApprovalStatus; submittedAt: string; prospect: { name: string; company: string } };

const row = (ref: string, approval: ApprovalStatus, submittedAt: string, name = "Test Person", company = "Test Co"): Row => ({
  ref,
  approval,
  submittedAt,
  prospect: { name, company },
});
const refs = (rows: readonly { ref: string }[]) => rows.map((r) => r.ref);

describe("filterLeads", () => {
  const rows = [
    row("LD-4K9P", "needs_clarification", "2026-11-09T10:00:00Z", "Sunita Bhatt", "Ormerod Wholesale Foods"),
    row("LD-5T6C", "pending", "2026-11-09T04:00:00Z", "Tom Whitcombe", "Halden Freight"),
    row("LD-7C3E", "approved", "2026-10-29T09:30:00Z", "Oluwaseun Adeyemi", "Ludgate Precision Engineering"),
  ];

  it("returns everything for an empty query and approval all", () => {
    expect(refs(filterLeads(rows, { query: "", approval: "all" }))).toEqual(refs(rows));
  });

  it("matches the ref, the prospect name and the company, ignoring case", () => {
    expect(refs(filterLeads(rows, { query: "ld-5t6c", approval: "all" }))).toEqual(["LD-5T6C"]);
    expect(refs(filterLeads(rows, { query: "SUNITA", approval: "all" }))).toEqual(["LD-4K9P"]);
    expect(refs(filterLeads(rows, { query: "precision eng", approval: "all" }))).toEqual(["LD-7C3E"]);
  });

  it("trims the query and treats a blank query as no query", () => {
    expect(refs(filterLeads(rows, { query: "  halden  ", approval: "all" }))).toEqual(["LD-5T6C"]);
    expect(refs(filterLeads(rows, { query: "   ", approval: "all" }))).toEqual(refs(rows));
  });

  it("filters by approval status", () => {
    expect(refs(filterLeads(rows, { query: "", approval: "pending" }))).toEqual(["LD-5T6C"]);
  });

  it("combines query and approval", () => {
    expect(filterLeads(rows, { query: "halden", approval: "approved" })).toEqual([]);
  });

  it("does not mutate the input", () => {
    const copy = [...rows];
    filterLeads(rows, { query: "tom", approval: "pending" });
    expect(rows).toEqual(copy);
  });

  it("counts match the sample data segments", () => {
    const count = (approval: ApprovalStatus) => filterLeads(SAMPLE_LEADS, { query: "", approval }).length;
    expect([count("pending"), count("needs_clarification"), count("approved"), count("rejected")]).toEqual([6, 2, 4, 2]);
  });
});

describe("sortLeads", () => {
  const rows = [
    row("A", "approved", "2026-11-02T10:00:00Z", "n", "Brindle & Marsh"),
    row("B", "pending", "2026-11-09T10:00:00Z", "n", "ashgrove Vets"),
    row("C", "draft", "2026-11-05T10:00:00Z", "n", "Calderbrook Homes"),
    row("D", "rejected", "2026-11-07T10:00:00Z", "n", "Dunmore"),
    row("E", "needs_clarification", "2026-11-08T10:00:00Z", "n", "Eaton"),
  ];

  it("sorts by submission time both ways", () => {
    expect(refs(sortLeads(rows, { key: "submittedAt", dir: "asc" }))).toEqual(["A", "C", "D", "E", "B"]);
    expect(refs(sortLeads(rows, { key: "submittedAt", dir: "desc" }))).toEqual(["B", "E", "D", "C", "A"]);
  });

  it("sorts by company ignoring case", () => {
    expect(refs(sortLeads(rows, { key: "company", dir: "asc" }))).toEqual(["B", "A", "C", "D", "E"]);
    expect(refs(sortLeads(rows, { key: "company", dir: "desc" }))).toEqual(["E", "D", "C", "A", "B"]);
  });

  it("sorts approval in workflow order", () => {
    expect(refs(sortLeads(rows, { key: "approval", dir: "asc" }))).toEqual(["C", "B", "E", "A", "D"]);
    expect(refs(sortLeads(rows, { key: "approval", dir: "desc" }))).toEqual(["D", "A", "E", "B", "C"]);
  });

  it("is stable for equal keys in both directions", () => {
    const ties = [
      row("X1", "pending", "2026-11-01T00:00:00Z"),
      row("X2", "pending", "2026-11-01T00:00:00Z"),
      row("X3", "pending", "2026-11-01T00:00:00Z"),
    ];
    expect(refs(sortLeads(ties, { key: "approval", dir: "asc" }))).toEqual(["X1", "X2", "X3"]);
    expect(refs(sortLeads(ties, { key: "approval", dir: "desc" }))).toEqual(["X1", "X2", "X3"]);
  });

  it("does not mutate the input", () => {
    const copy = [...rows];
    sortLeads(rows, { key: "company", dir: "desc" });
    expect(rows).toEqual(copy);
  });
});

describe("toggleSort", () => {
  it("flips the direction when the same column is clicked", () => {
    expect(toggleSort({ key: "company", dir: "asc" }, "company")).toEqual({ key: "company", dir: "desc" });
    expect(toggleSort({ key: "company", dir: "desc" }, "company")).toEqual({ key: "company", dir: "asc" });
  });
  it("starts a new column ascending, except submission time which starts newest first", () => {
    expect(toggleSort({ key: "submittedAt", dir: "desc" }, "approval")).toEqual({ key: "approval", dir: "asc" });
    expect(toggleSort({ key: "company", dir: "asc" }, "submittedAt")).toEqual({ key: "submittedAt", dir: "desc" });
  });
});
