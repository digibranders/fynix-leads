import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays } from "@/lib/calendar/view";
import { aliasIdentity, campaign, campaignShare, lead, meeting } from "@/server/db/schema";
import type { SeededCampaign, SeededOrganisation } from "@/server/db/testing/seed";
import type { TenantActor } from "@/server/domain/alias-identity";
import { loadCalendarForFynix, loadCalendarForTenant } from "@/server/domain/calendar-data";
import { memberIdFor, userIn } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

/**
 * Calendar step D: what each role's calendar page is given. The client team and their busy time, the meetings the viewer may read inside the range, and a
 * choice of client for the sides that serve more than one. A client person is named to the client and to Fynix only, and never an agency to a client.
 */
const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});

const DAY = 86_400_000;
const at = (days: number, hour: number): Date => {
  const date = new Date(Date.now() + days * DAY);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
};
const dayOf = (date: Date): string => date.toISOString().slice(0, 10);
const actorIn = (org: SeededOrganisation, kind: "client" | "agency"): TenantActor => ({ userId: userIn(rig, org).id, orgId: org.id, orgKind: kind, role: "member" });

interface Cast {
  readonly served: SeededCampaign;
  readonly other: SeededCampaign;
  readonly agency: TenantActor;
  readonly client: TenantActor;
  readonly servedHost: string;
}
let cast: Cast;
let counter = 0;

async function book(target: SeededCampaign, host: string, start: Date, company: string): Promise<void> {
  counter += 1;
  const owner = rig.dbs.owner.db;
  const agencyUser = userIn(rig, target.agency);
  const [alias] = await owner
    .insert(aliasIdentity)
    .values({ publicRef: `ALI-C${counter}XX`, memberId: await memberIdFor(rig, agencyUser.id), clientOrgId: target.client.id, displayName: `Alias ${counter}`, jobTitle: "Partnerships", aliasEmail: `alias${counter}@brand.example`, verifiedAt: new Date(), status: "active" })
    .returning({ id: aliasIdentity.id });
  const [row] = await owner
    .insert(lead)
    .values({
      campaignId: target.id,
      sourceOrgId: target.agency.id,
      submittedByUserId: agencyUser.id,
      aliasIdentityId: alias?.id ?? "",
      hostMemberId: host,
      publicRef: `LD-D${counter}XX`,
      prospectName: "Marta Prospect",
      prospectTitle: "Head of Finance",
      prospectCompany: company,
      prospectDomain: `prospect${counter}.example`,
      prospectLinkedinUrl: `https://www.linkedin.com/in/prospect${counter}`,
      prospectEmail: `prospect${counter}@prospect.example`,
      bantBudget: "b",
      bantAuthority: "a",
      bantNeed: "n",
      bantTimeline: "t",
      submittedAt: new Date(),
      stage: "scheduled",
      scheduledMeetingTime: start,
    })
    .returning({ id: lead.id });
  await owner.insert(meeting).values({ publicRef: `MTG-D${counter}XX`, leadId: row?.id ?? "", campaignId: target.id, hostMemberId: host, scheduledStartTime: start, googleMeetUrl: `https://meet.google.com/aaa-bbbb-ccc` });
}

beforeEach(async () => {
  const world = await rig.reset();
  counter = 0;
  const owner = rig.dbs.owner.db;
  await owner.delete(campaignShare);
  const served = world.campaigns.find((row) => row.client.id === world.kestrel.id && row.agency.id === world.brightpath.id);
  const moved = world.campaigns.find((row) => row.client.id === world.halden.id && row.agency.id === world.brightpath.id);
  if (served === undefined || moved === undefined) throw new Error("The seed is missing a Brightpath campaign");
  await owner.update(campaign).set({ agencyOrgId: world.northgate.id }).where(eq(campaign.id, moved.id));
  cast = {
    served,
    other: { ...moved, agency: world.northgate },
    agency: actorIn(world.brightpath, "agency"),
    client: actorIn(world.kestrel, "client"),
    servedHost: await memberIdFor(rig, userIn(rig, world.kestrel).id),
  };
  await book(cast.served, cast.servedHost, at(3, 10), "Nordvik Cold Chain");
  await book(cast.other, await memberIdFor(rig, userIn(rig, world.halden).id), at(3, 11), "Other Client Prospect");
});

const query = () => ({ view: "day" as const, date: dayOf(at(3, 10)) });
const agencyDb = () => rig.dbs.roles.leads_agency.db;
const clientDb = () => rig.dbs.roles.leads_client.db;

describe("an agency calendar", () => {
  it("offers the clients of its campaigns, shows the team of the one chosen and the meetings with it, with the link and no client person", async () => {
    const data = await loadCalendarForTenant(agencyDb(), cast.agency, "agency", { query: query() });
    expect(data.choices).toEqual([{ campaignId: cast.served.id, label: cast.served.client.name }]);
    expect(data.selected).toBe(cast.served.id);
    expect(data.people.map((person) => person.displayName)).toEqual([userIn(rig, cast.served.client).name]);
    expect(data.meetings).toHaveLength(1);
    expect(data.meetings[0]).toMatchObject({ company: "Nordvik Cold Chain", status: "scheduled", minutes: 30, link: "https://meet.google.com/aaa-bbbb-ccc", with: null });
    const text = JSON.stringify(data.meetings);
    expect(text).not.toContain(userIn(rig, cast.served.client).name);
    expect(text).not.toContain("Other Client Prospect");
  });

  it("shows the person as busy while the meeting is on, without saying what the busy time is", async () => {
    const data = await loadCalendarForTenant(agencyDb(), cast.agency, "agency", { query: query() });
    expect(data.people[0]?.busy).toEqual([{ start: at(3, 10).toISOString(), end: new Date(at(3, 10).getTime() + 30 * 60_000).toISOString() }]);
    expect(Object.keys(data.people[0]?.busy[0] ?? {}).sort()).toEqual(["end", "start"]);
  });

  it("ignores a campaign that is not one of its own and falls back to its first client", async () => {
    const data = await loadCalendarForTenant(agencyDb(), cast.agency, "agency", { team: cast.other.id, query: query() });
    expect(data.selected).toBe(cast.served.id);
  });

  it("leaves out a meeting outside the days on screen", async () => {
    const far = { view: "day" as const, date: addDays(dayOf(at(3, 10)), 20) };
    const data = await loadCalendarForTenant(agencyDb(), cast.agency, "agency", { query: far });
    expect(data.meetings).toEqual([]);
  });

  it("is empty for an agency with no campaign", async () => {
    const lonely = { userId: cast.agency.userId, orgId: rig.world().fynix.id, orgKind: "agency" as const, role: "member" as const };
    const data = await loadCalendarForTenant(agencyDb(), lonely, "agency", { query: query() });
    expect(data).toEqual({ choices: [], selected: null, people: [], meetings: [] });
  });
});

describe("a client calendar", () => {
  it("has one team and no choice, and names the client person on the meeting", async () => {
    const data = await loadCalendarForTenant(clientDb(), cast.client, "client", { query: query() });
    expect(data.choices).toEqual([]);
    expect(data.meetings).toHaveLength(1);
    expect(data.meetings[0]?.with).toBe(userIn(rig, cast.served.client).name);
    expect(JSON.stringify(data)).not.toContain(rig.world().brightpath.name);
  });
});

describe("the Fynix calendar", () => {
  it("offers every client, and shows the meetings of the one chosen with the person named", async () => {
    const first = await loadCalendarForFynix(rig.deps(), rig.staffActor, { query: query() });
    expect(first.choices.map((choice) => choice.label).sort()).toEqual([cast.served.client.name, cast.other.client.name].sort());
    const halden = await loadCalendarForFynix(rig.deps(), rig.staffActor, { team: cast.other.id, query: query() });
    expect(halden.people.map((person) => person.displayName)).toEqual([userIn(rig, cast.other.client).name]);
    expect(halden.meetings.map((row) => row.company)).toEqual(["Other Client Prospect"]);
    expect(halden.meetings[0]?.with).toBe(userIn(rig, cast.other.client).name);
  });
});
