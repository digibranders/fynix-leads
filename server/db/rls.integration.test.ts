import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TENANT_COLUMNS, agencyCampaignBriefColumns, columnNames } from "@/server/db/columns";
import { TENANT_ROLES } from "@/server/db/roles";
import { auditLog, campaign, organisation } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { captureErrorText, openTestDatabases, queryAs, resetDatabase, type TestDatabases } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";

/** The behaviour of the organisation and campaign tables: what each role can read and write, and what the database refuses. */

let dbs: TestDatabases;
let world: SeedWorld;
const USER = "55555555-5555-4555-8555-555555555555";

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

/**
 * A Fynix transaction that changes a domain table must append an `audit_log` row (migration 0012), or it cannot commit.
 * These tests are about the tables, not the audit log, so every `asFynix` call ends with one minimal row, written for the
 * seeded Fynix user (the audit actor must be a real user). server/domain/fynix-write.ts is the real way to do this.
 */
const asFynix = <T>(work: Parameters<typeof withScope<T>>[2]) => {
  const actor = world.users[0]?.id;
  if (actor === undefined) throw new Error("The seed world has no Fynix user");
  return withScope(dbs.roles.leads_fynix.db, { orgId: null, userId: actor }, async (tx) => {
    const result = await work(tx);
    await tx.insert(auditLog).values({ action: "test.write", subjectTable: "campaign", subjectId: USER });
    return result;
  });
};

describe("Fynix", () => {
  it("reads every organisation and every campaign, hidden columns included", async () => {
    const campaigns = await asFynix((tx) => tx.select().from(campaign));
    expect(campaigns).toHaveLength(4);
    expect(campaigns.map((row) => row.internalNotes).sort()).toEqual(world.campaigns.map((row) => row.internalNotes).sort());
    expect(await asFynix((tx) => tx.select().from(organisation))).toHaveLength(5);
  });

  it("creates and updates organisations and campaigns", async () => {
    await asFynix(async (tx) => {
      await tx.insert(organisation).values({ publicRef: "ORG-3C4D", kind: "agency", name: "Ridgeway Ltd" });
      await tx.update(campaign).set({ status: "active" }).where(eq(campaign.publicRef, "CMP-7Q2X"));
    });
    const rows = await asFynix((tx) => tx.select({ status: campaign.status }).from(campaign).where(eq(campaign.publicRef, "CMP-7Q2X")));
    expect(rows).toEqual([{ status: "active" }]);
  });

  it("cannot delete or truncate: an organisation is archived, not removed", async () => {
    const asFynixSql = (statement: string) => queryAs(dbs.roles.leads_fynix.db, { orgId: null, userId: USER }, statement);
    expect(await captureErrorText(asFynixSql("delete from campaign"))).toContain("permission denied for table campaign");
    expect(await captureErrorText(asFynixSql("delete from organisation"))).toContain("permission denied for table organisation");
    expect(await captureErrorText(asFynixSql("truncate campaign"))).toContain("permission denied for table campaign");
  });
});

describe("tenant column lists match the grants", () => {
  const granted = async (role: string, table: string): Promise<string[]> => {
    const result = await dbs.owner.db.execute<{ column_name: string }>(
      sql.raw(`select a.attname::text as column_name from pg_attribute a
        where a.attrelid = 'public.${table}'::regclass and a.attnum > 0 and not a.attisdropped
          and has_column_privilege('${role}', a.attrelid, a.attnum, 'SELECT') order by 1`),
    );
    return result.rows.map((row) => row.column_name);
  };

  it.each(TENANT_ROLES)("%s: columns.ts names exactly the columns the database granted", async (role) => {
    // The two parent ids are granted so the policies can compare them (migrations 0037 and 0039), and columns.ts does not list them: no read selects them.
    const policyColumns = ["agency_org_id", "client_org_id"];
    // Since migrations 0054 (agency) and 0064 (client) both roles read the campaign brief.
    const briefColumns = columnNames(agencyCampaignBriefColumns);
    // Release 1 of retiring the brand columns: nothing selects them, but the grants stay until release 2 drops the columns (the process that is still running reads them).
    const retired = { campaign: ["client_brand_name"], organisation: ["brand_name"] };
    expect(await granted(role, "campaign")).toEqual([...columnNames(TENANT_COLUMNS[role].campaign), ...policyColumns, ...briefColumns, ...retired.campaign].sort());
    expect(await granted(role, "organisation")).toEqual([...columnNames(TENANT_COLUMNS[role].organisation), ...retired.organisation].sort());
  });
});

describe("integrity the database enforces", () => {
  const baseCampaign = () => ({
    publicRef: "CMP-9X9X",
    name: "New campaign",
    clientOrgId: world.kestrel.id,
    agencyOrgId: world.brightpath.id,
    startDate: "2026-12-01",
    endDate: "2027-01-31",
    monthlyTarget: 10,
    totalTarget: 30,
  });

  it("refuses an agency as the client, and a client as the agency", async () => {
    const agencyAsClient = await captureErrorText(asFynix((tx) => tx.insert(campaign).values({ ...baseCampaign(), clientOrgId: world.brightpath.id })));
    expect(agencyAsClient).toContain("campaign_client_org_fk");
    const clientAsAgency = await captureErrorText(asFynix((tx) => tx.insert(campaign).values({ ...baseCampaign(), agencyOrgId: world.kestrel.id })));
    expect(clientAsAgency).toContain("campaign_agency_org_fk");
  });

  it("refuses to write the constant kind columns", async () => {
    const message = await captureErrorText(
      asFynix((tx) => tx.execute(sql`insert into campaign (public_ref, name, client_org_id, client_org_kind, agency_org_id, start_date, end_date, monthly_target, total_target)
        values ('CMP-9X9X', 'x', ${world.kestrel.id}, 'agency', ${world.brightpath.id}, '2026-12-01', '2027-01-01', 1, 1)`)),
    );
    expect(message).toContain("cannot insert a non-DEFAULT value into column");
  });

  it.each([
    ["a reference in the wrong shape", { publicRef: "CMP-abc" }, "campaign_public_ref_format"],
    ["an end date before the start date", { endDate: "2026-11-30" }, "campaign_dates_in_order"],
    ["a negative target", { monthlyTarget: -1 }, "campaign_targets_not_negative"],
    ["a reference already in use", { publicRef: "CMP-7Q2X" }, "campaign_public_ref_unique"],
  ])("refuses %s", async (_label, change, constraint) => {
    const message = await captureErrorText(asFynix((tx) => tx.insert(campaign).values({ ...baseCampaign(), ...change })));
    expect(message).toContain(constraint);
  });
});

describe("the scope functions", () => {
  it("are inlined into the policy, so the planner sees the setting and not a function call", async () => {
    const plan = await dbs.owner.db.execute<{ "QUERY PLAN": string }>(sql`explain (verbose, costs off) select public.app_current_org_id()`);
    const text = plan.rows.map((row) => row["QUERY PLAN"]).join("\n");
    expect(text).toContain("current_setting('app.org_id'");
    expect(text).not.toContain("app_current_org_id");
  });

  it("return NULL with no scope and the organisation with one", async () => {
    expect(await queryAs(dbs.roles.leads_client.db, null, "select public.app_current_org_id() as org")).toEqual([{ org: null }]);
    expect(await queryAs(dbs.roles.leads_client.db, { orgId: world.kestrel.id, userId: USER }, "select public.app_current_org_id() as org, public.app_current_user_id() as usr")).toEqual([
      { org: world.kestrel.id, usr: USER },
    ]);
  });
});
