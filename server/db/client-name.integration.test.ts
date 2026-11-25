import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { campaign, campaignShare, organisation } from "@/server/db/schema";
import { captureErrorText, openTestDatabases, queryAs, resetDatabase, type TestDatabases } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";

/** A client has one name, `organisation.name` (migration 0078), and an agency or coordinator reads it only for the clients of campaigns it serves. */

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
