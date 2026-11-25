import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { campaign, campaignShare, organisation } from "@/server/db/schema";
import { captureErrorText, openTestDatabases, queryAs, resetDatabase, type TestDatabases } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";

/**
 * Release 1 of retiring the brand columns (migration 0078): a client has one name, `organisation.name`, and an agency or coordinator reads it only for the
 * clients of campaigns it serves. This is the one test file that still names the three old columns, on purpose: it proves they stay valid and filled with the
 * name for the process that runs the old code until release 2 drops them.
 */

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

const nameOfCampaign = async (role: "leads_client" | "leads_agency" | "leads_fynix" | "leads_auth" | "leads_public", orgId: string | null, campaignId: string): Promise<unknown> =>
  (await queryAs(dbs.roles[role].db, { orgId, userId: USER }, `select public.app_campaign_client_name('${campaignId}') as name`))[0]?.name;

const nameOfClient = async (role: "leads_client" | "leads_agency" | "leads_fynix", orgId: string | null, clientId: string): Promise<unknown> =>
  (await queryAs(dbs.roles[role].db, { orgId, userId: USER }, `select public.app_client_name('${clientId}') as name`))[0]?.name;

/** A third client with one campaign, served by Northgate only: Brightpath does not serve it. */
async function addOrchard(): Promise<{ readonly clientId: string; readonly campaignId: string }> {
  const [client] = await dbs.owner.db.insert(organisation).values({ publicRef: "ORG-5E6F", kind: "client", name: "Orchard Foods Ltd" }).returning({ id: organisation.id });
  const [first] = await dbs.owner.db.select().from(campaign).where(eq(campaign.agencyOrgId, world.northgate.id));
  if (client === undefined || first === undefined) throw new Error("The seed world is missing a row");
  const [created] = await dbs.owner.db
    .insert(campaign)
    .values({ ...first, id: randomUUID(), publicRef: "CMP-9C9C", name: "Orchard campaign", clientOrgId: client.id })
    .returning({ id: campaign.id });
  if (created === undefined) throw new Error("The campaign insert returned no row");
  return { clientId: client.id, campaignId: created.id };
}

describe("app_campaign_client_name and app_client_name", () => {
  it("give an agency the client's name for every campaign it serves, and nothing for a campaign it does not serve", async () => {
    const orchard = await addOrchard();
    for (const agency of [world.brightpath, world.northgate]) {
      for (const row of world.campaigns) {
        const serves = row.agency.id === agency.id;
        expect(await nameOfCampaign("leads_agency", agency.id, row.id), `${agency.name} ${row.publicRef}`).toBe(serves ? row.client.name : null);
      }
    }
    expect(await nameOfCampaign("leads_agency", world.northgate.id, orchard.campaignId)).toBe("Orchard Foods Ltd");
    expect(await nameOfCampaign("leads_agency", world.brightpath.id, orchard.campaignId)).toBeNull();
    expect(await nameOfClient("leads_agency", world.northgate.id, orchard.clientId)).toBe("Orchard Foods Ltd");
    expect(await nameOfClient("leads_agency", world.brightpath.id, orchard.clientId)).toBeNull();
    expect(await nameOfClient("leads_agency", world.brightpath.id, world.kestrel.id)).toBe(world.kestrel.name);
  });

  it("give a partner agency the name only once a campaign is shared with it, and never the name of an agency or of Fynix", async () => {
    const [partner] = await dbs.owner.db.insert(organisation).values({ publicRef: "ORG-6P3S", kind: "agency", name: "Ridgeway Partner Media Ltd", parentOrgId: world.brightpath.id }).returning({ id: organisation.id });
    const target = world.campaigns[0];
    if (partner === undefined || target === undefined) throw new Error("The seed world is missing a row");
    expect(await nameOfCampaign("leads_agency", partner.id, target.id)).toBeNull();
    expect(await nameOfClient("leads_agency", partner.id, target.client.id)).toBeNull();
    await dbs.owner.db.insert(campaignShare).values({ campaignId: target.id, agencyOrgId: partner.id, monthlyShare: 5 });
    expect(await nameOfCampaign("leads_agency", partner.id, target.id)).toBe(target.client.name);
    expect(await nameOfClient("leads_agency", partner.id, target.client.id)).toBe(target.client.name);
    // Only a client has a name to give: an agency id and the Fynix id answer nothing.
    expect(await nameOfClient("leads_agency", world.brightpath.id, world.northgate.id)).toBeNull();
    expect(await nameOfClient("leads_agency", world.brightpath.id, world.fynix.id)).toBeNull();
  });

  it("give a client its own name only, and Fynix every name", async () => {
    for (const row of world.campaigns) {
      expect(await nameOfCampaign("leads_client", world.kestrel.id, row.id)).toBe(row.client.id === world.kestrel.id ? world.kestrel.name : null);
      expect(await nameOfCampaign("leads_client", world.halden.id, row.id)).toBe(row.client.id === world.halden.id ? world.halden.name : null);
      expect(await nameOfCampaign("leads_fynix", null, row.id)).toBe(row.client.name);
    }
    expect(await nameOfClient("leads_client", world.kestrel.id, world.kestrel.id)).toBe(world.kestrel.name);
    expect(await nameOfClient("leads_client", world.kestrel.id, world.halden.id)).toBeNull();
    expect(await nameOfClient("leads_fynix", null, world.halden.id)).toBe(world.halden.name);
  });

  it("answer nothing without a scope, and are closed to the roles that have no portal", async () => {
    const target = world.campaigns[0];
    if (target === undefined) throw new Error("The seed world has no campaign");
    expect(await nameOfCampaign("leads_agency", null, target.id)).toBeNull();
    for (const role of ["leads_auth", "leads_public"] as const) {
      expect(await captureErrorText(nameOfCampaign(role, null, target.id))).toContain("permission denied for function app_campaign_client_name");
    }
  });
});

describe("the old columns, kept valid until release 2", () => {
  const legacyCampaignName = async (publicRef: string): Promise<unknown> =>
    (await dbs.owner.db.execute<{ name: string }>(sql`select client_brand_name as name from campaign where public_ref = ${publicRef}`)).rows[0]?.name;

  it("fill a new client's brand_name with its name, so an insert that leaves it out passes the check", async () => {
    await dbs.owner.db.insert(organisation).values({ publicRef: "ORG-5E6F", kind: "client", name: "No Brand Ltd" });
    const rows = await dbs.owner.db.execute<{ brand_name: string }>(sql`select brand_name from organisation where public_ref = 'ORG-5E6F'`);
    expect(rows.rows[0]?.brand_name).toBe("No Brand Ltd");
  });

  it("write the client's name into campaign.client_brand_name, and follow a rename made by Fynix", async () => {
    expect(await legacyCampaignName("CMP-7Q2X")).toBe(world.kestrel.name);
    await dbs.owner.db.update(organisation).set({ name: "Kestrel Freight Ltd" }).where(eq(organisation.id, world.kestrel.id));
    expect(await legacyCampaignName("CMP-7Q2X")).toBe("Kestrel Freight Ltd");
    expect(await legacyCampaignName("CMP-8T3W")).toBe("Kestrel Freight Ltd");
    expect(await legacyCampaignName("CMP-4M6R")).toBe(world.halden.name);
    const brand = await dbs.owner.db.execute<{ brand_name: string }>(sql`select brand_name from organisation where id = ${world.kestrel.id}`);
    expect(brand.rows[0]?.brand_name).toBe("Kestrel Freight Ltd");
  });

  it("restore campaign.client_brand_name when it is written by hand", async () => {
    await dbs.owner.db.execute(sql`update campaign set client_brand_name = 'Typed by hand' where public_ref = 'CMP-7Q2X'`);
    expect(await legacyCampaignName("CMP-7Q2X")).toBe(world.kestrel.name);
  });

  it("set alias_identity.client_brand_name to the client's name, cut to the 100 characters its check allows", async () => {
    const longName = `Longname ${"x".repeat(105)}`;
    const [client] = await dbs.owner.db.insert(organisation).values({ publicRef: "ORG-5E6F", kind: "client", name: longName }).returning({ id: organisation.id });
    const member = (await dbs.owner.db.execute<{ id: string }>(sql`select m.id from member m join organisation o on o.id = m.org_id where o.id = ${world.brightpath.id} limit 1`)).rows[0];
    if (client === undefined || member === undefined) throw new Error("The seed world is missing a row");
    await dbs.owner.db.execute(sql`insert into alias_identity (public_ref, member_id, client_org_id, display_name, job_title, alias_email) values ('ALI-AAAA', ${member.id}, ${world.kestrel.id}, 'A', 'T', 'a@x.example'), ('ALI-BBBB', ${member.id}, ${client.id}, 'B', 'T', 'b@x.example')`);
    const rows = await dbs.owner.db.execute<{ public_ref: string; client_brand_name: string }>(sql`select public_ref, client_brand_name from alias_identity order by public_ref`);
    expect(rows.rows).toEqual([
      { public_ref: "ALI-AAAA", client_brand_name: world.kestrel.name },
      { public_ref: "ALI-BBBB", client_brand_name: longName.slice(0, 100) },
    ]);
  });
});

describe("app_backfill_alias_clients: aliases made before phase 2", () => {
  it("matches an alias to the one client its old text names (brand or name, any case), and leaves an unmatched or ambiguous one without a client", async () => {
    const member = (await dbs.owner.db.execute<{ id: string }>(sql`select m.id from member m where m.org_id = ${world.brightpath.id} limit 1`)).rows[0];
    if (member === undefined) throw new Error("The seed world has no agency member");
    // Two clients share a name apart from case, so a text that names both is ambiguous.
    await dbs.owner.db.insert(organisation).values([
      { publicRef: "ORG-5E6F", kind: "client", name: "Twin Foods" },
      { publicRef: "ORG-5E6G", kind: "client", name: "TWIN FOODS" },
    ]);
    const old = [
      ["ALI-AAAA", "kestrel logistics LTD", "a@x.example"],
      ["ALI-BBBB", "Halden Foods Ltd", "b@x.example"],
      ["ALI-CCCC", "Nobody Ltd", "c@x.example"],
      ["ALI-DDDD", "twin foods", "d@x.example"],
    ] as const;
    for (const [ref, text, email] of old) {
      await dbs.owner.db.execute(sql`insert into alias_identity (public_ref, member_id, client_brand_name, display_name, job_title, alias_email) values (${ref}, ${member.id}, ${text}, 'A', 'T', ${email})`);
    }
    const left = (await dbs.owner.db.execute<{ left: number }>(sql`select public.app_backfill_alias_clients() as left`)).rows[0]?.left;
    expect(left).toBe(2);
    const rows = await dbs.owner.db.execute<{ public_ref: string; client_org_id: string | null; client_brand_name: string }>(sql`select public_ref, client_org_id, client_brand_name from alias_identity order by public_ref`);
    expect(rows.rows).toEqual([
      { public_ref: "ALI-AAAA", client_org_id: world.kestrel.id, client_brand_name: world.kestrel.name },
      { public_ref: "ALI-BBBB", client_org_id: world.halden.id, client_brand_name: world.halden.name },
      { public_ref: "ALI-CCCC", client_org_id: null, client_brand_name: "Nobody Ltd" },
      { public_ref: "ALI-DDDD", client_org_id: null, client_brand_name: "twin foods" },
    ]);
  });
});
