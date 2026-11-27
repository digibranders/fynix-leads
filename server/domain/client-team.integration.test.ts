import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SeededCampaign } from "@/server/db/testing/seed";
import { campaign, campaignHost, campaignShare, hostHours, member } from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";
import { memberIdFor, userIn } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

/**
 * The client team (calendar step B): an agency reads the names of every active person of a client it serves, and their hours, whether or not anyone ever
 * marked them as a host. It reads nothing about a client it does not serve, and never a job title, an email or a phone.
 */
const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});

interface Pair {
  readonly served: SeededCampaign;
  readonly other: SeededCampaign;
}

let pair: Pair;

beforeEach(async () => {
  const world = await rig.reset();
  const owner = rig.dbs.owner.db;
  // Nobody is a host and nothing is shared, so what an agency reads can only come from the client team itself.
  await owner.delete(campaignHost);
  await owner.delete(campaignShare);
  // The seed has both agencies on both clients. Halden's campaign with Brightpath moves to Northgate, so Brightpath serves Kestrel and nobody else.
  const served = world.campaigns.find((row) => row.client.id === world.kestrel.id && row.agency.id === world.brightpath.id);
  const moved = world.campaigns.find((row) => row.client.id === world.halden.id && row.agency.id === world.brightpath.id);
  if (served === undefined || moved === undefined) throw new Error("The seed is missing a Brightpath campaign");
  await owner.update(campaign).set({ agencyOrgId: world.northgate.id }).where(eq(campaign.id, moved.id));
  const other: SeededCampaign = { ...moved, agency: world.northgate };
  pair = { served, other };
});

const asAgency = <T>(orgId: string, userId: string, work: Parameters<typeof withTenantScope<T>>[2]) => withTenantScope(rig.dbs.roles.leads_agency.db, { orgId, userId }, work);
const servedAgencyUser = () => userIn(rig, pair.served.agency);

async function teamAsServedAgency(campaignId: string) {
  const agent = servedAgencyUser();
  return asAgency(pair.served.agency.id, agent.id, async (tx) => (await tx.execute<{ member_id: string; display_name: string; time_zone: string | null }>(sql`select * from public.app_campaign_team(${campaignId}::uuid)`)).rows);
}

describe("app_campaign_team", () => {
  it("lists every active person of the client with a name and a time zone, though nobody was ever made a host", async () => {
    const expected = await rig.dbs.owner.db.select({ id: member.id, name: member.displayName }).from(member).where(and(eq(member.orgId, pair.served.client.id), eq(member.status, "active")));
    expect(expected.length).toBeGreaterThan(0);
    const rows = await teamAsServedAgency(pair.served.id);
    expect(rows.map((row) => row.member_id).sort()).toEqual(expected.map((row) => row.id).sort());
    expect(rows.map((row) => row.display_name).sort()).toEqual(expected.map((row) => row.name).sort());
  });

  it("returns a name and a time zone and nothing else, so no job title, email or phone can leave through it", async () => {
    const [row] = await teamAsServedAgency(pair.served.id);
    expect(Object.keys(row ?? {}).sort()).toEqual(["display_name", "member_id", "time_zone"]);
  });

  it("leaves out a suspended person", async () => {
    const person = await memberIdFor(rig, userIn(rig, pair.served.client).id);
    await rig.dbs.owner.db.update(member).set({ status: "suspended" }).where(eq(member.id, person));
    const rows = await teamAsServedAgency(pair.served.id);
    expect(rows.map((row) => row.member_id)).not.toContain(person);
  });

  it("returns nothing for a campaign the agency neither coordinates nor has a share of", async () => {
    expect(await teamAsServedAgency(pair.other.id)).toEqual([]);
  });
});

describe("the hours an agency reads", () => {
  it("shows the hours of a person of a client it serves, and none of a client it does not serve", async () => {
    const servedMember = await memberIdFor(rig, userIn(rig, pair.served.client).id);
    const otherMember = await memberIdFor(rig, userIn(rig, pair.other.client).id);
    const window = { timeZone: "Europe/London", weekday: 1, startMinute: 540, endMinute: 1020 };
    await rig.dbs.owner.db.insert(hostHours).values([
      { memberId: servedMember, ...window },
      { memberId: otherMember, ...window },
    ]);
    const agent = servedAgencyUser();
    const seen = await asAgency(pair.served.agency.id, agent.id, async (tx) => (await tx.execute<{ member_id: string }>(sql`select member_id from host_hours`)).rows.map((row) => row.member_id));
    expect(seen).toEqual([servedMember]);
  });
});
