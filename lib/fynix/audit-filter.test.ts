import { describe, expect, it } from "vitest";
import { auditHref, escapeLike, parseAuditFilter } from "@/lib/fynix/audit-filter";

describe("parseAuditFilter", () => {
  it("reads every part, and defaults to the first page with no filter", () => {
    expect(parseAuditFilter({})).toEqual({ prefix: "", subject: "", person: "", q: "", page: 1 });
    expect(parseAuditFilter({ action: "lead", subject: " CMP-7 ", person: "0A1B2C3D-0000-4000-8000-000000000001", q: " archived ", page: "3" })).toEqual({
      prefix: "lead",
      subject: "CMP-7",
      person: "0a1b2c3d-0000-4000-8000-000000000001",
      q: "archived",
      page: 3,
    });
  });
  it("drops what is not valid instead of trusting it", () => {
    expect(parseAuditFilter({ action: "lead.%", person: "not-a-uuid", page: "-2" })).toEqual({ prefix: "", subject: "", person: "", q: "", page: 1 });
    expect(parseAuditFilter({ page: "2.5" }).page).toBe(1);
    expect(parseAuditFilter({ q: ["a", "b"] }).q).toBe("");
    expect(parseAuditFilter({ q: "x".repeat(200) }).q).toHaveLength(80);
  });
});

describe("auditHref", () => {
  it("leaves out empty parts and page one", () => {
    expect(auditHref("/fynix/audit", {})).toBe("/fynix/audit");
    expect(auditHref("/fynix/audit", { prefix: "campaign", q: "close", page: 1 })).toBe("/fynix/audit?action=campaign&q=close");
    expect(auditHref("/fynix/audit", { prefix: "campaign", page: 2 })).toBe("/fynix/audit?action=campaign&page=2");
  });
});

describe("escapeLike", () => {
  it("makes underscores, percent signs and backslashes literal", () => {
    expect(escapeLike("lead_decide%\\")).toBe("lead\\_decide\\%\\\\");
  });
});
