import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agreement, campaign, campaignShare, member, organisation } from "@/server/db/schema";
import { captureErrorText, openTestDatabases, resetDatabase, type TestDatabases } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";

/**
 * The organisation hierarchy and the campaign settings, as the database enforces them. Everything here runs as the owner: the
 * triggers and constraints apply to every role, and the Fynix role's own rules (admin only, audited) are tested in
 * fynix-admin.integration.test.ts and by the domain tests.
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
  world = await seedWorld(dbs.owner, { withUsers: false });
});

const failure = (work: PromiseLike<unknown>): Promise<string> => captureErrorText(Promise.resolve(work));

async function insertAgency(publicRef: string, parentOrgId: string | null = null): Promise<{ readonly id: string; readonly parentOrgKind: "fynix" | "client" | "agency" | null }> {
  const [row] = await dbs.owner.db
    .insert(organisation)
    .values({ publicRef, kind: "agency", name: `Agency ${publicRef}`, parentOrgId })
    .returning({ id: organisation.id, parentOrgKind: organisation.parentOrgKind });
  if (row === undefined) throw new Error("The agency insert returned no row");
  return row;
}

const campaignValues = (agencyOrgId: string) =>
  ({ publicRef: "CMP-3C4D", name: "Partner campaign", clientOrgId: world.kestrel.id, agencyOrgId, startDate: "2027-01-04", endDate: "2027-06-30", monthlyTarget: 5, totalTarget: 30 }) as const;

describe("organisation.parent_org_id", () => {
  it("lets a partner agency point at a coordinator, and fills in the parent's kind itself", async () => {
    const partner = await insertAgency("ORG-3C4D", world.brightpath.id);
    expect(partner.parentOrgKind).toBe("agency");
    const [client] = await dbs.owner.db.select({ parentOrgId: organisation.parentOrgId, parentOrgKind: organisation.parentOrgKind }).from(organisation).where(eq(organisation.id, world.kestrel.id));
    expect(client).toEqual({ parentOrgId: null, parentOrgKind: null });
  });

  it("refuses an organisation that is its own parent", async () => {
    const lone = await insertAgency("ORG-3C4D");
    expect(await failure(dbs.owner.db.update(organisation).set({ parentOrgId: lone.id }).where(eq(organisation.id, lone.id)))).toContain("organisation_parent_not_self");
  });

  it("refuses a parent on a client, because only an agency may have one", async () => {
    const message = await failure(
      dbs.owner.db.insert(organisation).values({ publicRef: "ORG-5E6F", kind: "client", name: "Orchard Foods Ltd", parentOrgId: world.brightpath.id }),
    );
    expect(message).toContain("organisation_parent_only_agency");
  });

  it("refuses a parent that is not an agency", async () => {
    expect(await failure(dbs.owner.db.insert(organisation).values({ publicRef: "ORG-3C4D", kind: "agency", name: "Agency X", parentOrgId: world.kestrel.id }))).toContain("organisation_parent_fk");
  });

  it("refuses a parent that is itself a partner agency: two levels at most", async () => {
    const partner = await insertAgency("ORG-3C4D", world.brightpath.id);
    expect(await failure(dbs.owner.db.insert(organisation).values({ publicRef: "ORG-5E6F", kind: "agency", name: "Agency Y", parentOrgId: partner.id }))).toContain("organisation_two_levels_only");
  });

  it("refuses to give a parent to an organisation that already has partner agencies", async () => {
    await insertAgency("ORG-3C4D", world.brightpath.id);
    expect(await failure(dbs.owner.db.update(organisation).set({ parentOrgId: world.northgate.id }).where(eq(organisation.id, world.brightpath.id)))).toContain("organisation_has_partner_agencies");
  });

  it("refuses to give a parent to an organisation that is the coordinator of a campaign", async () => {
    expect(await failure(dbs.owner.db.update(organisation).set({ parentOrgId: world.brightpath.id }).where(eq(organisation.id, world.northgate.id)))).toContain("organisation_is_a_campaign_supplier");
  });

  it("gives a parent to an agency that has no partner agencies and no campaigns", async () => {
    const lone = await insertAgency("ORG-3C4D");
    await dbs.owner.db.update(organisation).set({ parentOrgId: world.brightpath.id }).where(eq(organisation.id, lone.id));
    const [row] = await dbs.owner.db.select({ parentOrgId: organisation.parentOrgId }).from(organisation).where(eq(organisation.id, lone.id));
    expect(row?.parentOrgId).toBe(world.brightpath.id);
  });
});

describe("campaign.agency_org_id is a coordinator", () => {
  it("refuses a campaign whose agency is a partner agency, on insert", async () => {
    const partner = await insertAgency("ORG-3C4D", world.brightpath.id);
    expect(await failure(dbs.owner.db.insert(campaign).values(campaignValues(partner.id)))).toContain("campaign_supplier_has_parent");
  });

  it("refuses to move a campaign to a partner agency, on update", async () => {
    const partner = await insertAgency("ORG-3C4D", world.brightpath.id);
    const target = world.campaigns[0];
    if (target === undefined) throw new Error("no campaign");
    expect(await failure(dbs.owner.db.update(campaign).set({ agencyOrgId: partner.id }).where(eq(campaign.id, target.id)))).toContain("campaign_supplier_has_parent");
  });

  it("accepts a campaign for a coordinator", async () => {
    await dbs.owner.db.insert(campaign).values(campaignValues(world.northgate.id));
    const [row] = await dbs.owner.db.select({ agencyOrgId: campaign.agencyOrgId }).from(campaign).where(eq(campaign.publicRef, "CMP-3C4D"));
    expect(row?.agencyOrgId).toBe(world.northgate.id);
  });
});

describe("a campaign's coordinator is fixed once it has shares or a coordinator agreement", () => {
  let createdBy: string;
  beforeEach(async () => {
    await resetDatabase(dbs.owner);
    world = await seedWorld(dbs.owner);
    const [fynixMember] = await dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.orgKind, "fynix")).limit(1);
    if (fynixMember === undefined) throw new Error("The seed world has no Fynix member");
    createdBy = fynixMember.id;
  });
  const target = (): { readonly id: string; readonly agencyOrgId: string } => {
    const row = world.campaigns[0];
    if (row === undefined) throw new Error("no campaign");
    return { id: row.id, agencyOrgId: row.agency.id };
  };
  const coordinatorOf = async (): Promise<string | undefined> => (await dbs.owner.db.select({ agencyOrgId: campaign.agencyOrgId }).from(campaign).where(eq(campaign.id, target().id)))[0]?.agencyOrgId;
  const moveToOtherCoordinator = () => dbs.owner.db.update(campaign).set({ agencyOrgId: world.northgate.id }).where(eq(campaign.id, target().id));

  it("lets the coordinator change while the campaign has no share and no coordinator agreement", async () => {
    await moveToOtherCoordinator();
    expect(await coordinatorOf()).toBe(world.northgate.id);
  });

  it("refuses the change once the campaign has a share, and names no row values", async () => {
    await dbs.owner.db.insert(campaignShare).values({ campaignId: target().id, agencyOrgId: target().agencyOrgId, monthlyShare: 5 });
    const databaseMessage = await moveToOtherCoordinator().then(
      () => "no error",
      (error: unknown) => (error instanceof Error && error.cause instanceof Error ? error.cause.message : "no database error"),
    );
    expect(databaseMessage).toBe("campaign_supplier_in_use: a campaign with shares or a supplier agreement keeps its supplier");
    expect(await coordinatorOf()).toBe(target().agencyOrgId);
  });

  it("refuses the change once the campaign has a coordinator agreement", async () => {
    await dbs.owner.db.insert(agreement).values({ campaignId: target().id, party: "supplier", version: 1, monthlyTarget: 5, totalTarget: 30, createdBy });
    expect(await failure(moveToOtherCoordinator())).toContain("campaign_supplier_in_use");
  });

  it("allows the change when only a client agreement exists", async () => {
    await dbs.owner.db.insert(agreement).values({ campaignId: target().id, party: "client", version: 1, monthlyTarget: 5, totalTarget: 30, createdBy });
    await moveToOtherCoordinator();
    expect(await coordinatorOf()).toBe(world.northgate.id);
  });

  it("allows an update that sets the same coordinator, even with shares", async () => {
    await dbs.owner.db.insert(campaignShare).values({ campaignId: target().id, agencyOrgId: target().agencyOrgId, monthlyShare: 5 });
    await dbs.owner.db.update(campaign).set({ agencyOrgId: target().agencyOrgId }).where(eq(campaign.id, target().id));
    expect(await coordinatorOf()).toBe(target().agencyOrgId);
  });
});

describe("campaign.time_zone and campaign.meeting_minutes", () => {
  const first = (): string => {
    const row = world.campaigns[0];
    if (row === undefined) throw new Error("no campaign");
    return row.id;
  };

  it("default to London time and 30 minutes, so existing rows stay valid", async () => {
    const [row] = await dbs.owner.db.select({ timeZone: campaign.timeZone, meetingMinutes: campaign.meetingMinutes }).from(campaign).where(eq(campaign.id, first()));
    expect(row).toEqual({ timeZone: "Europe/London", meetingMinutes: 30 });
  });

  it.each([14, 241, 0, -5])("refuse a meeting length of %i minutes", async (minutes) => {
    expect(await failure(dbs.owner.db.update(campaign).set({ meetingMinutes: minutes }).where(eq(campaign.id, first())))).toContain("campaign_meeting_minutes_range");
  });

  it.each([15, 240])("accept a meeting length of %i minutes", async (minutes) => {
    await dbs.owner.db.update(campaign).set({ meetingMinutes: minutes }).where(eq(campaign.id, first()));
    const [row] = await dbs.owner.db.select({ meetingMinutes: campaign.meetingMinutes }).from(campaign).where(eq(campaign.id, first()));
    expect(row?.meetingMinutes).toBe(minutes);
  });

  it.each(["", "   ", "x".repeat(65)])("refuse the time zone text %j", async (zone) => {
    expect(await failure(dbs.owner.db.update(campaign).set({ timeZone: zone }).where(eq(campaign.id, first())))).toContain("campaign_time_zone_length");
  });
});
