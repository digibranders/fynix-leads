import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agreement, aliasIdentity, campaign, campaignHost, campaignShare, hostHours, member, organisation } from "@/server/db/schema";
import { listClientMeetings, listAgencyMeetings, recordMeetingOutcome } from "@/server/domain/meetings";
import { clientReviewLead, listAgencyLeads, listClientLeads, submitLead } from "@/server/domain/leads";
import { getOrCreateConversation, listConversationMessages, listConversations, postMessage, type MessagingActor } from "@/server/domain/messaging";
import type { TenantActor } from "@/server/domain/alias-identity";
import { acceptAgreementByTenant } from "@/server/domain/agreements";
import { listCurrentAgreements } from "@/server/domain/agreements-tenant";
import { listClientHosts } from "@/server/domain/hosts-tenant";
import { listPartnerAgencies } from "@/server/domain/partners-tenant";
import { isPartnerAgency } from "@/server/domain/org-role";
import { openDomainRig } from "@/server/domain/testing";

/**
 * SKIPPED until the tenant data access is made to work. Run as the real roles, every flow below fails: the policies of
 * migrations 0032 to 0036 read hidden tables and columns (campaign.client_org_id, organisation, alias_identity's code hash),
 * the campaign and campaign_share policies call each other, and the column-level grants omit columns the code reads. Fixing
 * that needs SECURITY DEFINER helpers for the cross-table checks, which this project has so far avoided on purpose, so it is
 * an owner decision. Remove `.skip` when it is done; these tests are the acceptance check.
 *
 * The tenant flows end to end, as the roles the app really runs them as (leads_client and leads_agency, never the owner):
 * a lead is submitted, reviewed and held, and people talk about it. These had no database test before, and a grant that is
 * one column short only shows up here, as "permission denied".
 */
const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});

interface Cast {
  readonly campaignId: string;
  readonly clientActor: TenantActor;
  readonly agencyActor: TenantActor;
  readonly hostMemberId: string;
  readonly aliasId: string;
  readonly clientOrgId: string;
  readonly supplierOrgId: string;
}

let cast: Cast;

beforeEach(async () => {
  const world = await rig.reset();
  const owner = rig.dbs.owner.db;
  await owner.update(campaign).set({ status: "active" });
  const target = world.campaigns.find((row) => row.agency.id === world.brightpath.id);
  if (target === undefined) throw new Error("The seed has no campaign served by Brightpath");
  const clientUser = world.users.find((person) => person.organisation.id === target.client.id);
  const agencyUser = world.users.find((person) => person.organisation.id === world.brightpath.id);
  const admin = world.users[0];
  if (clientUser === undefined || agencyUser === undefined || admin === undefined) throw new Error("The seed is missing a person");
  const memberOf = async (userId: string): Promise<string> => {
    const [row] = await owner.select({ id: member.id }).from(member).where(eq(member.userId, userId));
    if (row === undefined) throw new Error("No member");
    return row.id;
  };
  // The seeded client and agency people are ordinary members; the actions below are a manager's.
  await owner.update(member).set({ role: "manager" }).where(eq(member.userId, clientUser.id));
  await owner.update(member).set({ role: "manager" }).where(eq(member.userId, agencyUser.id));
  const clientMember = await memberOf(clientUser.id);
  const agencyMember = await memberOf(agencyUser.id);
  await owner.insert(campaignHost).values({ campaignId: target.id, clientOrgId: target.client.id, memberId: clientMember, jobTitle: "Chief Operating Officer" });
  for (const weekday of [1, 2, 3, 4, 5]) await owner.insert(hostHours).values({ memberId: clientMember, timeZone: "Europe/London", weekday, startMinute: 0, endMinute: 1440 });
  await owner.insert(agreement).values({ campaignId: target.id, party: "supplier", version: 1, monthlyTarget: 10, totalTarget: 60, createdBy: await memberOf(admin.id) });
  await owner.insert(agreement).values({ campaignId: target.id, party: "client", version: 1, monthlyTarget: 12, totalTarget: 72, createdBy: await memberOf(admin.id) });
  await owner.insert(campaignShare).values({ campaignId: target.id, agencyOrgId: world.brightpath.id, monthlyShare: 5 }).onConflictDoNothing();
  const [alias] = await owner
    .insert(aliasIdentity)
    .values({ publicRef: "ALI-7M2K", memberId: agencyMember, clientBrandName: "Brand", displayName: "Lena Hartmann", jobTitle: "BD", aliasEmail: "lena@brand.example", verifiedAt: new Date(), status: "active" })
    .returning({ id: aliasIdentity.id });
  if (alias === undefined) throw new Error("No alias");
  cast = {
    campaignId: target.id,
    clientActor: { userId: clientUser.id, orgId: target.client.id, orgKind: "client", role: "manager" },
    agencyActor: { userId: agencyUser.id, orgId: world.brightpath.id, orgKind: "agency", role: "manager" },
    hostMemberId: clientMember,
    aliasId: alias.id,
    clientOrgId: target.client.id,
    supplierOrgId: world.brightpath.id,
  };
});

function leadInput(times: readonly string[]) {
  return {
    campaignId: cast.campaignId,
    aliasIdentityId: cast.aliasId,
    hostMemberId: cast.hostMemberId,
    prospectName: "Marta Lindqvist",
    prospectTitle: "Head of Logistics",
    prospectCompany: "Nordvik Cold Chain",
    prospectDomain: "nordvikcold.example",
    prospectLinkedinUrl: "https://www.linkedin.com/in/marta",
    prospectEmail: "marta@nordvikcold.example",
    bantBudget: "Confirmed",
    bantAuthority: "Signs off",
    bantNeed: "Replacing a manual process",
    bantTimeline: "One quarter",
    proposedTimes: [...times],
  };
}

function nextWeekdayAt(hour: number, daysAhead: number): string {
  const date = new Date(Date.now() + daysAhead * 86_400_000);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

describe("a lead from submission to outcome", () => {
  it("is submitted by an agency, accepted by the client, held, and visible to both", async () => {
    const db = rig.dbs.roles;
    const time = nextWeekdayAt(10, 3);
    await submitLead(db.leads_agency.db, rig.deps(), cast.agencyActor, leadInput([time]));

    const agencyLeads = await listAgencyLeads(db.leads_agency.db, cast.agencyActor);
    expect(agencyLeads).toHaveLength(1);
    const clientLeads = await listClientLeads(db.leads_client.db, cast.clientActor);
    expect(clientLeads).toHaveLength(1);
    const created = clientLeads[0];
    if (created === undefined) throw new Error("No lead");

    await clientReviewLead(db.leads_client.db, rig.deps(), cast.clientActor, { leadId: created.id, action: "accept", selectedMeetingTime: time });

    const clientMeetings = await listClientMeetings(db.leads_client.db, cast.clientActor);
    expect(clientMeetings).toHaveLength(1);
    expect(await listAgencyMeetings(db.leads_agency.db, cast.agencyActor)).toHaveLength(1);

    const meetingRow = clientMeetings[0];
    if (meetingRow === undefined) throw new Error("No meeting");
    await recordMeetingOutcome(db.leads_client.db, rig.deps(), cast.clientActor, { meetingId: meetingRow.id, outcome: "held" });
  });
});

describe("messaging, as each role", () => {
  it("lets a client open a thread with Fynix, post to it, and read it back", async () => {
    const actor: MessagingActor = { userId: cast.clientActor.userId, orgId: cast.clientActor.orgId, orgKind: "client", role: "manager", displayName: "Client" };
    const conv = await getOrCreateConversation(rig.dbs.roles.leads_client.db, actor, { campaignId: cast.campaignId, side: "client_fynix", clientOrgId: cast.clientOrgId, subject: "Times" });
    await postMessage(rig.dbs.roles.leads_client.db, actor, { conversationId: conv.id, body: "Can we move the call?" });
    expect(await listConversations(rig.dbs.roles.leads_client.db, actor)).toHaveLength(1);
    expect(await listConversationMessages(rig.dbs.roles.leads_client.db, actor, conv.id)).toHaveLength(1);
  });

  it("lets a supplier open a thread with Fynix, post to it, and read it back", async () => {
    const actor: MessagingActor = { userId: cast.agencyActor.userId, orgId: cast.supplierOrgId, orgKind: "agency", role: "manager", displayName: "Supplier" };
    const conv = await getOrCreateConversation(rig.dbs.roles.leads_agency.db, actor, { campaignId: cast.campaignId, side: "supplier_fynix", supplierOrgId: cast.supplierOrgId, subject: "Target" });
    await postMessage(rig.dbs.roles.leads_agency.db, actor, { conversationId: conv.id, body: "Is the share confirmed?" });
    expect(await listConversations(rig.dbs.roles.leads_agency.db, actor)).toHaveLength(1);
    expect(await listConversationMessages(rig.dbs.roles.leads_agency.db, actor, conv.id)).toHaveLength(1);
  });
});

describe("agreements, as each role", () => {
  it("shows a client its own agreement and lets a manager accept it once", async () => {
    const db = rig.dbs.roles.leads_client.db;
    const before = await listCurrentAgreements(db, cast.clientActor, "client");
    expect(before).toHaveLength(1);
    expect(before[0]?.monthlyTarget).toBe(12);
    expect(before[0]?.acceptedAt).toBeNull();
    await acceptAgreementByTenant(db, rig.deps(), cast.clientActor, { agreementId: before[0]?.id }, "203.0.113.9");
    expect((await listCurrentAgreements(db, cast.clientActor, "client"))[0]?.acceptedAt).not.toBeNull();
  });

  it("shows a supplier its supplier agreement and never the client's", async () => {
    const db = rig.dbs.roles.leads_agency.db;
    const rows = await listCurrentAgreements(db, cast.agencyActor, "supplier");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.monthlyTarget).toBe(10);
    expect(await listCurrentAgreements(db, cast.agencyActor, "client")).toHaveLength(0);
  });
});

describe("hosts, as a client", () => {
  it("lists the people who take meetings, with their weekly hours", async () => {
    const hosts = await listClientHosts(rig.dbs.roles.leads_client.db, cast.clientActor);
    expect(hosts).toHaveLength(1);
    expect(hosts[0]?.jobTitle).toBe("Chief Operating Officer");
    expect(hosts[0]?.hours).toHaveLength(5);
  });
});

describe("partner agencies, as a supplier", () => {
  it("lists the supplier's partner agencies by name, with the shares they hold", async () => {
    const owner = rig.dbs.owner.db;
    const [partner] = await owner.insert(organisation).values({ publicRef: "ORG-6P3S", kind: "agency", name: "Ridgeway Partner Media Ltd", parentOrgId: cast.supplierOrgId }).returning({ id: organisation.id });
    if (partner === undefined) throw new Error("No partner");
    await owner.insert(campaignShare).values({ campaignId: cast.campaignId, agencyOrgId: partner.id, monthlyShare: 3 });
    const rows = await listPartnerAgencies(rig.dbs.roles.leads_agency.db, cast.agencyActor);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Ridgeway Partner Media Ltd", publicRef: "ORG-6P3S" });
    expect(rows[0]?.shares).toHaveLength(1);
    expect(rows[0]?.shares[0]?.monthlyShare).toBe(3);
  });
});

describe("which portal an agency organisation belongs to", () => {
  it("tells a supplier from a partner agency", async () => {
    const owner = rig.dbs.owner.db;
    expect(await isPartnerAgency(rig.dbs.roles.leads_agency.db, cast.agencyActor)).toBe(false);
    const [partner] = await owner.insert(organisation).values({ publicRef: "ORG-6P3S", kind: "agency", name: "Ridgeway Partner Media Ltd", parentOrgId: cast.supplierOrgId }).returning({ id: organisation.id });
    if (partner === undefined) throw new Error("No partner");
    const partnerUserId = cast.agencyActor.userId;
    expect(await isPartnerAgency(rig.dbs.roles.leads_agency.db, { userId: partnerUserId, orgId: partner.id })).toBe(true);
  });
});
