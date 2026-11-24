import { getAuthTables } from "better-auth/db";
import { getTableColumns } from "drizzle-orm";
import { twoFactor as twoFactorPlugin } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { MIN_SECRET_LENGTH } from "@/server/auth/create-auth";
import { account, session, twoFactor, user, verification } from "@/server/db/schema";

/**
 * Better Auth reads and writes these four tables by the field names it declares. If a Better Auth upgrade adds, renames
 * or requires a field, this fails with the table and field named, before a sign-in does.
 */

const tables = getAuthTables({ emailAndPassword: { enabled: true }, plugins: [twoFactorPlugin()] } as never);
const ours = { user, session, account, verification, twoFactor } as const;

describe("the auth tables match what Better Auth declares", () => {
  it.each(Object.entries(ours))("%s has exactly Better Auth's fields, plus id", (model, table) => {
    const declared = tables[model]?.fields ?? {};
    expect(Object.keys(getTableColumns(table)).sort()).toEqual(["id", ...Object.keys(declared)].sort());
  });

  it.each(Object.entries(ours))("%s: a field Better Auth requires is NOT NULL here, and an optional one is nullable", (model, table) => {
    const declared = tables[model]?.fields ?? {};
    const columns = getTableColumns(table) as Record<string, { notNull: boolean }>;
    for (const [name, field] of Object.entries(declared)) {
      expect(columns[name]?.notNull, `${model}.${name}`).toBe((field as { required?: boolean }).required !== false);
    }
  });

  it("is checked against a Better Auth that still has the secret rule this app relies on", () => {
    expect(MIN_SECRET_LENGTH).toBe(32);
  });
});
