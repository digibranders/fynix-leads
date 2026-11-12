import { describe, expect, it } from "vitest";
import type { Database } from "@/server/db/pool";
import { assertUuid, withOrgScope, withScope } from "@/server/db/scope";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

/** A database that records whether anything reached it. */
function spyDatabase(): { readonly db: Database; readonly calls: string[] } {
  const calls: string[] = [];
  const db = {
    transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      calls.push("transaction");
      return work({ execute: async () => calls.push("set_config") });
    },
  } as unknown as Database;
  return { db, calls };
}

describe("assertUuid", () => {
  it("accepts a UUID in either case", () => {
    expect(() => assertUuid(ORG, "orgId")).not.toThrow();
    expect(() => assertUuid(ORG.toUpperCase(), "orgId")).not.toThrow();
  });

  it.each(["", "not-a-uuid", "11111111-1111-4111-8111-11111111111", `${ORG}; drop table organisation`, undefined, null, 42])(
    "rejects %j with a message that does not echo it",
    (value) => {
      expect(() => assertUuid(value, "orgId")).toThrow("orgId must be a UUID");
      expect(() => assertUuid(value, "orgId")).not.toThrow(/drop table/);
    },
  );
});

describe("withScope", () => {
  it("validates before opening a transaction", async () => {
    const { db, calls } = spyDatabase();
    await expect(withScope(db, { orgId: "nope", userId: USER }, async () => "unreachable")).rejects.toThrow("orgId must be a UUID");
    await expect(withScope(db, { orgId: ORG, userId: "" }, async () => "unreachable")).rejects.toThrow("userId must be a UUID");
    expect(calls).toEqual([]);
  });

  it("sets the scope inside one transaction, then runs the work", async () => {
    const { db, calls } = spyDatabase();
    await expect(withScope(db, { orgId: ORG, userId: USER }, async () => "done")).resolves.toBe("done");
    expect(calls).toEqual(["transaction", "set_config"]);
  });

  it("accepts no organisation, for Fynix", async () => {
    const { db, calls } = spyDatabase();
    await withScope(db, { orgId: null, userId: USER }, async () => undefined);
    expect(calls).toEqual(["transaction", "set_config"]);
  });
});

describe("withOrgScope", () => {
  it.each([
    ["no organisation", { orgId: undefined, userId: USER }, "orgId must be a UUID"],
    ["an empty organisation", { orgId: "", userId: USER }, "orgId must be a UUID"],
    ["no user", { orgId: ORG, userId: undefined }, "userId must be a UUID"],
    ["no scope at all", undefined, "A scope is required to use the leads_client pool"],
  ])("refuses a tenant pool with %s, before any connection is made", async (_label, scope, message) => {
    await expect(withOrgScope("leads_client", scope as never, async () => "unreachable")).rejects.toThrow(message);
  });
});
