import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agreement, agreementAcceptance, member } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { captureErrorText, openTestDatabases, resetDatabase, type TestDatabases } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";

/**
 * The phase 1D tables as the database enforces them: who may touch each, which columns Fynix may change, the checks, the
 * unique constraints and the triggers. Everything is written as the owner unless a test is about the Fynix role. The services
 * are tested in server/domain/*.integration.test.ts.
 */

let dbs: TestDatabases;
let world: SeedWorld;

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetDatabase(dbs.owner);
  world = await seedWorld(dbs.owner);
});

const failure = (work: PromiseLike<unknown>): Promise<string> => captureErrorText(Promise.resolve(work));
const PRIVILEGES = ["DELETE", "INSERT", "SELECT", "TRUNCATE", "UPDATE"] as const;

/** The table level privileges a role holds on a table, in alphabetical order. Column grants do not count here. */
async function tablePrivileges(role: string, table: string): Promise<string[]> {
  const held: string[] = [];
  for (const privilege of PRIVILEGES) {
    const result = await dbs.owner.db.execute<{ allowed: boolean }>(sql.raw(`select has_table_privilege('${role}', 'public.${table}', '${privilege}') as allowed`));
    if (result.rows[0]?.allowed === true) held.push(privilege);
  }
  return held;
}

/** The columns of a table that a role may UPDATE, in table order. A table level UPDATE lists every column. */
async function updatableColumns(role: string, table: string): Promise<string[]> {
  const result = await dbs.owner.db.execute<{ name: string }>(
    sql.raw(`select a.attname::text as name from pg_attribute a
      where a.attrelid = 'public.${table}'::regclass and a.attnum > 0 and not a.attisdropped and has_column_privilege('${role}', a.attrelid, a.attnum, 'UPDATE')
      order by a.attnum`),
  );
  return result.rows.map((row) => row.name);
}

function firstOf<T>(rows: readonly T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`No ${what} in the seed world`);
  return row;
}

const campaignId = (): string => firstOf(world.campaigns, "campaign").id;
const userId = (index: number): string => firstOf(world.users.slice(index), "user").id;
async function memberIdOf(user: string): Promise<string> {
  return firstOf(await dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.userId, user)), "member").id;
}

async function newAgreement(overrides: Partial<typeof agreement.$inferInsert> = {}): Promise<string> {
  const rows = await dbs.owner.db
    .insert(agreement)
    .values({ campaignId: campaignId(), party: "client", version: 1, monthlyTarget: 20, totalTarget: 120, createdBy: await memberIdOf(userId(0)), ...overrides })
    .returning({ id: agreement.id });
  return firstOf(rows, "agreement").id;
}

describe("agreement", () => {
  it("is Fynix only: Fynix reads and inserts, and may change the status and nothing else; no other role holds anything", async () => {
    expect(await tablePrivileges("leads_fynix", "agreement")).toEqual(["INSERT", "SELECT"]);
    expect(await updatableColumns("leads_fynix", "agreement")).toEqual(["status"]);
    for (const role of ["leads_client", "leads_agency", "leads_auth", "leads_public"]) {
      expect(await tablePrivileges(role, "agreement"), role).toEqual([]);
      expect(await updatableColumns(role, "agreement"), role).toEqual([]);
    }
  });

  it("holds one row per campaign, party and version, and one current version per campaign and party", async () => {
    await newAgreement();
    expect(await failure(newAgreement())).toContain("agreement_campaign_party_version_unique");
    expect(await failure(newAgreement({ version: 2 }))).toContain("agreement_one_current");
    await newAgreement({ party: "supplier" });
    await newAgreement({ version: 2, status: "superseded" });
  });

  it("refuses to bring a superseded version back, even when no other version is current", async () => {
    const id = await newAgreement({ status: "superseded" });
    expect(await failure(dbs.owner.db.update(agreement).set({ status: "current" }).where(eq(agreement.id, id)))).toContain("agreement_superseded_is_final");
  });

  it("lets a current version be superseded", async () => {
    const id = await newAgreement();
    await dbs.owner.db.update(agreement).set({ status: "superseded" }).where(eq(agreement.id, id));
    expect(firstOf(await dbs.owner.db.select({ status: agreement.status }).from(agreement).where(eq(agreement.id, id)), "agreement").status).toBe("superseded");
  });

  it.each([
    ["a version below 1", { version: 0 }, "agreement_version_positive"],
    ["a negative monthly target", { monthlyTarget: -1 }, "agreement_targets_not_negative"],
    ["a negative total target", { totalTarget: -1 }, "agreement_targets_not_negative"],
    ["a dispute window of 0 hours", { disputeWindowHours: 0 }, "agreement_dispute_window_range"],
    ["a dispute window over 720 hours", { disputeWindowHours: 721 }, "agreement_dispute_window_range"],
  ])("refuses %s", async (_label, overrides, constraint) => {
    expect(await failure(newAgreement(overrides))).toContain(constraint);
  });

  it("defaults the dispute window to 48 hours and the rules and notes to empty text", async () => {
    const id = await newAgreement();
    const row = firstOf(await dbs.owner.db.select({ window: agreement.disputeWindowHours, rules: agreement.rules, notes: agreement.notes }).from(agreement).where(eq(agreement.id, id)), "agreement");
    expect(row).toEqual({ window: 48, rules: "", notes: "" });
  });

  it("must name an existing campaign and an existing member as its author", async () => {
    expect(await failure(newAgreement({ campaignId: "99999999-9999-4999-8999-999999999999" }))).toContain("foreign key");
    expect(await failure(newAgreement({ createdBy: "99999999-9999-4999-8999-999999999999" }))).toContain("foreign key");
  });

  it("cannot be changed by Fynix without an audit row", async () => {
    const author = await memberIdOf(userId(0));
    const message = await failure(
      withScope(dbs.roles.leads_fynix.db, { orgId: null, userId: userId(0) }, (tx) =>
        tx.insert(agreement).values({ campaignId: campaignId(), party: "client", version: 1, monthlyTarget: 1, totalTarget: 1, createdBy: author }),
      ),
    );
    expect(message).toContain("A change to agreement by Fynix has no audit_log row in its transaction");
  });
});

describe("agreement_acceptance", () => {
  it("lets Fynix read and add, and nothing else: an acceptance is never changed or removed; no other role holds anything", async () => {
    expect(await tablePrivileges("leads_fynix", "agreement_acceptance")).toEqual(["INSERT", "SELECT"]);
    expect(await updatableColumns("leads_fynix", "agreement_acceptance")).toEqual([]);
    for (const role of ["leads_client", "leads_agency", "leads_auth", "leads_public"]) {
      expect(await tablePrivileges(role, "agreement_acceptance"), role).toEqual([]);
      expect(await updatableColumns(role, "agreement_acceptance"), role).toEqual([]);
    }
  });

  it("holds one acceptance per agreement and user, and each must name a real agreement and user", async () => {
    const id = await newAgreement();
    const row = { agreementId: id, userId: userId(1), networkAddress: "203.0.113.9" };
    await dbs.owner.db.insert(agreementAcceptance).values(row);
    expect(await failure(dbs.owner.db.insert(agreementAcceptance).values(row))).toContain("agreement_acceptance_agreement_user_unique");
    expect(await failure(dbs.owner.db.insert(agreementAcceptance).values({ ...row, agreementId: "99999999-9999-4999-8999-999999999999" }))).toContain("foreign key");
    expect(await failure(dbs.owner.db.insert(agreementAcceptance).values({ ...row, userId: "99999999-9999-4999-8999-999999999999" }))).toContain("foreign key");
  });
});


