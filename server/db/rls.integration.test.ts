import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TENANT_COLUMNS, columnNames } from "@/server/db/columns";
import { TENANT_ROLES } from "@/server/db/roles";
import { campaign, organisation } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { selectCampaigns } from "@/server/db/tenant-reads";
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

const asFynix = <T>(work: Parameters<typeof withScope<T>>[2]) => withScope(dbs.roles.leads_fynix.db, { orgId: null, userId: USER }, work);

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
    expect(await granted(role, "campaign")).toEqual(columnNames(TENANT_COLUMNS[role].campaign).sort());
    expect(await granted(role, "organisation")).toEqual(columnNames(TENANT_COLUMNS[role].organisation).sort());
  });
});

describe("the client brand copy", () => {
  const brandOf = async (publicRef: string): Promise<string | undefined> => {
    const rows = await dbs.owner.db.select({ brand: campaign.clientBrandName }).from(campaign).where(eq(campaign.publicRef, publicRef));
    return rows[0]?.brand;
  };

  it("is filled from the client when a campaign is created", async () => {
    expect(await brandOf("CMP-7Q2X")).toBe("Kestrel");
    expect(await brandOf("CMP-4M6R")).toBe("Halden");
  });

  it("follows a rename of the client's brand, and the agency sees the new name", async () => {
    await asFynix((tx) => tx.update(organisation).set({ brandName: "Kestrel Freight" }).where(eq(organisation.publicRef, "ORG-4K9P")));
    expect(await brandOf("CMP-7Q2X")).toBe("Kestrel Freight");
    expect(await brandOf("CMP-8T3W")).toBe("Kestrel Freight");
    expect(await brandOf("CMP-4M6R")).toBe("Halden");
    const seen = await withScope(dbs.roles.leads_agency.db, { orgId: world.brightpath.id, userId: USER }, (tx) => selectCampaigns(tx, "leads_agency"));
    expect(seen.map((row) => row.clientBrandName).sort()).toEqual(["Halden", "Kestrel Freight"]);
  });

  it("is filled again when a campaign moves to another client, and cannot be set by the caller", async () => {
    await asFynix((tx) => tx.update(campaign).set({ clientOrgId: world.halden.id, clientBrandName: "Spoofed" }).where(eq(campaign.publicRef, "CMP-7Q2X")));
    expect(await brandOf("CMP-7Q2X")).toBe("Halden");
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

  it("refuses a client organisation without a brand name", async () => {
    const message = await captureErrorText(asFynix((tx) => tx.insert(organisation).values({ publicRef: "ORG-5E6F", kind: "client", name: "No Brand Ltd" })));
    expect(message).toContain("organisation_client_has_brand");
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
