import { describe, expect, it } from "vitest";
import { assertReadyToMigrate, type Queryable } from "@/server/db/migrate-guards";
import { ROLE_NAMES } from "@/server/db/roles";

function fakeDatabase(roles: readonly string[], currentUser: string): Queryable {
  return {
    query: async <Row extends Record<string, unknown>>(text: string) =>
      ({ rows: (text.includes("pg_roles") ? roles.map((rolname) => ({ rolname })) : [{ current_user: currentUser }]) as unknown as Row[] }),
  };
}

describe("assertReadyToMigrate", () => {
  it("passes when all six roles exist and the connection is the owner", async () => {
    await expect(assertReadyToMigrate(fakeDatabase(ROLE_NAMES, "leads_owner"))).resolves.toBeUndefined();
  });

  it("names every missing role and points at the roles script", async () => {
    const present = ROLE_NAMES.filter((name) => name !== "leads_client" && name !== "leads_public");
    await expect(assertReadyToMigrate(fakeDatabase(present, "leads_owner"))).rejects.toThrow(
      'Missing database roles: leads_client, leads_public. Run "pnpm db:roles" before migrating.',
    );
  });

  it("refuses a connection that is not the owner", async () => {
    await expect(assertReadyToMigrate(fakeDatabase(ROLE_NAMES, "a12345"))).rejects.toThrow("Migrations must run as leads_owner, not a12345.");
  });
});
