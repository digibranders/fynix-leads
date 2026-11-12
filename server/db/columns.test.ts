import { describe, expect, it } from "vitest";
import { TENANT_COLUMNS, columnNames } from "@/server/db/columns";
import { TENANT_ROLES, type TenantRoleName } from "@/server/db/roles";

/** Columns a tenant role must never be able to ask for, per table. The same list applies to both roles in phase 1A. */
const FORBIDDEN: Record<"organisation" | "campaign", readonly string[]> = {
  organisation: ["id", "status", "created_at"],
  campaign: ["client_org_id", "client_org_kind", "agency_org_id", "agency_org_kind", "internal_notes", "created_at"],
};

describe.each(TENANT_ROLES)("%s column lists", (role: TenantRoleName) => {
  it.each(["organisation", "campaign"] as const)("never name a forbidden column of %s", (table) => {
    const names = columnNames(TENANT_COLUMNS[role][table]);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => FORBIDDEN[table].includes(name))).toEqual([]);
  });

  it("names no column twice", () => {
    for (const table of ["organisation", "campaign"] as const) {
      const names = columnNames(TENANT_COLUMNS[role][table]);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
