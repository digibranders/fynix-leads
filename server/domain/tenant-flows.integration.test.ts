import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agreement, aliasIdentity, auditLog, campaign, campaignHost, campaignShare, hostHours, member, organisation, user } from "@/server/db/schema";
import { listClientMeetings, listAgencyMeetings, recordMeetingOutcome } from "@/server/domain/meetings";
import { clientReviewLead, listAgencyLeads, listClientLeads, submitLead } from "@/server/domain/leads";
import { getConversationSeenAt, getOrCreateConversation, listConversationMessages, listConversations, markConversationRead, postMessage, type MessagingActor } from "@/server/domain/messaging";
import type { TenantActor } from "@/server/domain/alias-identity";
import { acceptAgreementByTenant } from "@/server/domain/agreements";
import { listCurrentAgreements } from "@/server/domain/agreements-tenant";
import { listClientHosts } from "@/server/domain/hosts-tenant";
import { updateCampaign } from "@/server/domain/campaigns";
import { assignCampaignShare, listAssignableAgencies, unassignCampaignShare } from "@/server/domain/campaign-shares-tenant";
import { listTenantCampaigns } from "@/server/domain/campaigns-tenant";
import { listPartnerAgencies } from "@/server/domain/partners-tenant";
import { isPartnerAgency } from "@/server/domain/org-role";
import { addMessageAttachment, getAttachmentLocation, listConversationAttachments } from "@/server/domain/attachments";
import { addGroupMembers, canCreateGroup, createGroup, deleteGroup, getGroupInfo, leaveGroup, listGroupCandidates, openDirectChat, listGroupMembers, removeGroupMember, renameGroup } from "@/server/domain/groups";
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
  const [brand] = await owner.select({ name: campaign.clientBrandName }).from(campaign).where(eq(campaign.id, target.id));
  const brandOfTarget = brand?.name ?? "Brand";
  const [alias] = await owner
    .insert(aliasIdentity)
    .values({ publicRef: "ALI-7M2K", memberId: agencyMember, clientBrandName: brandOfTarget, displayName: "Lena Hartmann", jobTitle: "BD", aliasEmail: "lena@brand.example", verifiedAt: new Date(), status: "active" })
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

describe("read receipts", () => {
  it("says a message was seen once the other side opens the thread, and ignores the sender's own colleagues", async () => {
    const world = rig.world();
    const admin = world.users[0];
    if (admin === undefined) throw new Error("No Fynix user");
    const client: MessagingActor = { userId: cast.clientActor.userId, orgId: cast.clientActor.orgId, orgKind: "client", role: "manager", displayName: "Client" };
    const fynix: MessagingActor = { userId: admin.id, orgId: null, orgKind: "fynix", role: "manager", displayName: "Fynix" };
    const clientDb = rig.dbs.roles.leads_client.db;
    const fynixDb = rig.dbs.roles.leads_fynix.db;
    const conv = await getOrCreateConversation(clientDb, client, { campaignId: cast.campaignId, side: "client_fynix", clientOrgId: cast.clientOrgId, subject: "Times" });
    await postMessage(clientDb, client, { conversationId: conv.id, body: "Hello" });

    expect(await getConversationSeenAt(clientDb, client, conv.id)).toBeNull();
    await markConversationRead(clientDb, client, conv.id);
    expect(await getConversationSeenAt(clientDb, client, conv.id)).toBeNull();

    await markConversationRead(fynixDb, fynix, conv.id);
    expect(await getConversationSeenAt(clientDb, client, conv.id)).toBeInstanceOf(Date);
  });

  it("does nothing for a person who is not in the conversation", async () => {
    const client: MessagingActor = { userId: cast.clientActor.userId, orgId: cast.clientActor.orgId, orgKind: "client", role: "manager", displayName: "Client" };
    const outsider: MessagingActor = { userId: cast.agencyActor.userId, orgId: cast.supplierOrgId, orgKind: "agency", role: "manager", displayName: "Supplier" };
    const conv = await getOrCreateConversation(rig.dbs.roles.leads_client.db, client, { campaignId: cast.campaignId, side: "client_fynix", clientOrgId: cast.clientOrgId, subject: "Private" });
    await markConversationRead(rig.dbs.roles.leads_agency.db, outsider, conv.id);
    expect(await getConversationSeenAt(rig.dbs.roles.leads_client.db, client, conv.id)).toBeNull();
  });
});

describe("message attachments", () => {
  it("stores a file on your own message, lists it for the thread, and locates it for no one outside the thread", async () => {
    const client: MessagingActor = { userId: cast.clientActor.userId, orgId: cast.clientActor.orgId, orgKind: "client", role: "manager", displayName: "Client" };
    const outsider: MessagingActor = { userId: cast.agencyActor.userId, orgId: cast.supplierOrgId, orgKind: "agency", role: "manager", displayName: "Supplier" };
    const clientDb = rig.dbs.roles.leads_client.db;
    const conv = await getOrCreateConversation(clientDb, client, { campaignId: cast.campaignId, side: "client_fynix", clientOrgId: cast.clientOrgId, subject: "Files" });
    const message = await postMessage(clientDb, client, { conversationId: conv.id, body: "Attached brief.pdf" });

    const id = await addMessageAttachment(clientDb, client, { messageId: message.id, fileName: "brief.pdf", contentType: "application/pdf", sizeBytes: 1234, storageKey: "a".repeat(40) });

    const listed = await listConversationAttachments(clientDb, client, conv.id);
    expect(listed).toEqual([{ id, messageId: message.id, fileName: "brief.pdf", contentType: "application/pdf", sizeBytes: 1234 }]);
    expect((await getAttachmentLocation(clientDb, client, id))?.storageKey).toBe("a".repeat(40));

    const agencyDb = rig.dbs.roles.leads_agency.db;
    expect(await listConversationAttachments(agencyDb, outsider, conv.id)).toEqual([]);
    expect(await getAttachmentLocation(agencyDb, outsider, id)).toBeNull();
  });

  it("refuses to attach a file to someone else's message", async () => {
    const client: MessagingActor = { userId: cast.clientActor.userId, orgId: cast.clientActor.orgId, orgKind: "client", role: "manager", displayName: "Client" };
    const world = rig.world();
    const admin = world.users[0];
    if (admin === undefined) throw new Error("No Fynix user");
    const fynix: MessagingActor = { userId: admin.id, orgId: null, orgKind: "fynix", role: "manager", displayName: "Fynix" };
    const clientDb = rig.dbs.roles.leads_client.db;
    const conv = await getOrCreateConversation(clientDb, client, { campaignId: cast.campaignId, side: "client_fynix", clientOrgId: cast.clientOrgId, subject: "Files" });
    const message = await postMessage(clientDb, client, { conversationId: conv.id, body: "Hello" });
    await expect(addMessageAttachment(rig.dbs.roles.leads_fynix.db, fynix, { messageId: message.id, fileName: "x.pdf", contentType: "application/pdf", sizeBytes: 10, storageKey: "b".repeat(40) })).rejects.toThrow();
  });
});

describe("campaigns for each portal", () => {
  it("shows a client its own campaigns and a supplier the ones it serves, with counts that follow what each may see", async () => {
    const db = rig.dbs.roles;
    await submitLead(db.leads_agency.db, rig.deps(), cast.agencyActor, leadInput([new Date(Date.now() + 3 * 86_400_000).toISOString()]));

    await updateCampaign(rig.deps(), rig.actor, cast.campaignId, { geography: "United Kingdom", industries: ["Retail"], bantBudget: "50k a year", instructions: "Do not promise dates", internalNotes: "Fynix eyes only" });

    const clientView = await listTenantCampaigns(db.leads_client.db, cast.clientActor, "client");
    expect(clientView.length).toBeGreaterThan(0);
    expect(clientView.every((row) => row.share === null && row.agencies.length === 0)).toBe(true);
    const mine = clientView.find((row) => row.id === cast.campaignId);
    expect(mine?.inProgress).toBe(1);

    const supplierView = await listTenantCampaigns(db.leads_agency.db, cast.agencyActor, "supplier");
    const served = supplierView.find((row) => row.id === cast.campaignId);
    expect(served?.inProgress).toBe(1);
    // The supplier reads the brief; the client does not, and neither ever reads the internal notes.
    expect(served?.brief).toMatchObject({ geography: "United Kingdom", industries: ["Retail"], bantBudget: "50k a year", instructions: "Do not promise dates" });
    expect(JSON.stringify(served)).not.toContain("Fynix eyes only");
    expect(clientView.every((row) => row.brief === null)).toBe(true);
    const partnerSees = await listTenantCampaigns(db.leads_agency.db, cast.agencyActor, "agency");
    expect(partnerSees.find((row) => row.id === cast.campaignId)?.brief?.geography).toBe("United Kingdom");
    // Each side sees only its own: the client the campaigns of its organisation, the supplier the ones it serves.
    const owned = await rig.dbs.owner.db.select({ id: campaign.id, client: campaign.clientOrgId, supplier: campaign.agencyOrgId }).from(campaign);
    expect(clientView.map((row) => row.id).sort()).toEqual(owned.filter((row) => row.client === cast.clientOrgId).map((row) => row.id).sort());
    expect(supplierView.map((row) => row.id).sort()).toEqual(owned.filter((row) => row.supplier === cast.supplierOrgId).map((row) => row.id).sort());
  });
});

describe("the campaign rules around a lead", () => {
  it("refuses an alias made for another client's brand", async () => {
    const owner = rig.dbs.owner.db;
    await owner.update(aliasIdentity).set({ clientBrandName: "Some Other Brand" }).where(eq(aliasIdentity.id, cast.aliasId));
    await expect(submitLead(rig.dbs.roles.leads_agency.db, rig.deps(), cast.agencyActor, leadInput([new Date(Date.now() + 3 * 86_400_000).toISOString()]))).rejects.toThrow(/different client brand/);
  });

  it("refuses to assign an archived campaign", async () => {
    const owner = rig.dbs.owner.db;
    const [partnerRow] = await owner.insert(organisation).values({ publicRef: "ORG-5T8W", kind: "agency", name: "Late Partner", parentOrgId: cast.supplierOrgId }).returning({ id: organisation.id });
    if (partnerRow === undefined) throw new Error("No partner");
    await updateCampaign(rig.deps(), rig.actor, cast.campaignId, { status: "archived" });
    await expect(assignCampaignShare(rig.dbs.roles.leads_agency.db, cast.agencyActor, { campaignId: cast.campaignId, agencyOrgId: partnerRow.id, monthlyShare: 2 })).rejects.toThrow(/archived/);
  });
});

describe("a supplier assigns a campaign to its agencies", () => {
  async function partner(): Promise<string> {
    const owner = rig.dbs.owner.db;
    const [row] = await owner.insert(organisation).values({ publicRef: "ORG-7Q2M", kind: "agency", name: "Ridgeway Partner Media Ltd", parentOrgId: cast.supplierOrgId }).returning({ id: organisation.id });
    if (row === undefined) throw new Error("No partner");
    return row.id;
  }

  it("lets a supplier manager assign, change and take back a share, and shows the partner its own", async () => {
    const db = rig.dbs.roles.leads_agency.db;
    const partnerId = await partner();
    expect((await listAssignableAgencies(db, cast.agencyActor)).map((row) => row.id)).toContain(partnerId);

    await assignCampaignShare(db, cast.agencyActor, { campaignId: cast.campaignId, agencyOrgId: partnerId, monthlyShare: 6 });
    await assignCampaignShare(db, cast.agencyActor, { campaignId: cast.campaignId, agencyOrgId: partnerId, monthlyShare: 9 });
    const view = await listTenantCampaigns(db, cast.agencyActor, "supplier");
    expect(view.find((row) => row.id === cast.campaignId)?.agencies).toMatchObject([{ agencyOrgId: partnerId, monthlyShare: 9 }]);

    await unassignCampaignShare(db, cast.agencyActor, { campaignId: cast.campaignId, agencyOrgId: partnerId });
    expect((await listTenantCampaigns(db, cast.agencyActor, "supplier")).find((row) => row.id === cast.campaignId)?.agencies).toEqual([]);
    await expect(unassignCampaignShare(db, cast.agencyActor, { campaignId: cast.campaignId, agencyOrgId: partnerId })).rejects.toThrow(/does not hold/);
  });

  it("refuses an agency that is not the supplier's, and a supplier member who is not a manager", async () => {
    const db = rig.dbs.roles.leads_agency.db;
    const owner = rig.dbs.owner.db;
    const [stranger] = await owner.insert(organisation).values({ publicRef: "ORG-9X4K", kind: "agency", name: "Unrelated Agency" }).returning({ id: organisation.id });
    if (stranger === undefined) throw new Error("No stranger");
    await expect(assignCampaignShare(db, cast.agencyActor, { campaignId: cast.campaignId, agencyOrgId: stranger.id, monthlyShare: 3 })).rejects.toThrow();

    const partnerId = await partner();
    await owner.update(member).set({ role: "member" }).where(eq(member.userId, cast.agencyActor.userId));
    await expect(assignCampaignShare(db, { ...cast.agencyActor, role: "member" }, { campaignId: cast.campaignId, agencyOrgId: partnerId, monthlyShare: 4 })).rejects.toThrow(/manager/);
  });
});

describe("group chats", () => {
  function actors() {
    const world = rig.world();
    const admin = world.users[0];
    if (admin === undefined) throw new Error("No Fynix user");
    const fynix: MessagingActor = { userId: admin.id, orgId: null, orgKind: "fynix", role: "manager", displayName: "Fynix Admin" };
    const supplier: MessagingActor = { userId: cast.agencyActor.userId, orgId: cast.supplierOrgId, orgKind: "agency", role: "manager", displayName: "Sam Supplier" };
    const client: MessagingActor = { userId: cast.clientActor.userId, orgId: cast.clientActor.orgId, orgKind: "client", role: "manager", displayName: "Cleo Client" };
    return { fynix, supplier, client, fynixDb: rig.dbs.roles.leads_fynix.db, agencyDb: rig.dbs.roles.leads_agency.db, clientDb: rig.dbs.roles.leads_client.db, adminId: admin.id };
  }

  it("lets a Fynix admin add anyone, and a supplier add only its own people, its agencies and Fynix", async () => {
    const { fynix, supplier, fynixDb, agencyDb, adminId } = actors();
    const owner = rig.dbs.owner.db;
    const [partner] = await owner.insert(organisation).values({ publicRef: "ORG-6P3S", kind: "agency", name: "Ridgeway Partner Media Ltd", parentOrgId: cast.supplierOrgId }).returning({ id: organisation.id });
    if (partner === undefined) throw new Error("No partner");
    const [partnerUser] = await owner.insert(user).values({ email: "pat@ridgeway.example", name: "Pat Partner" }).returning({ id: user.id });
    if (partnerUser === undefined) throw new Error("No partner user");
    await owner.insert(member).values({ userId: partnerUser.id, orgId: partner.id, orgKind: "agency", role: "member", displayName: "Pat Partner" });

    expect(await canCreateGroup(fynixDb, fynix)).toBe(true);
    expect(await canCreateGroup(agencyDb, supplier)).toBe(true);
    expect(await canCreateGroup(rig.dbs.roles.leads_client.db, actors().client)).toBe(false);

    const everyone = (await listGroupCandidates(fynixDb, fynix)).map((row) => row.displayName);
    expect(everyone.length).toBeGreaterThan(3);
    const mine = await listGroupCandidates(agencyDb, supplier);
    const labels = new Set(mine.map((row) => row.roleLabel));
    expect(labels.has("Client")).toBe(false);
    expect(mine.some((row) => row.userId === partnerUser.id && row.roleLabel === "Agency")).toBe(true);
    expect(mine.some((row) => row.userId === adminId && row.roleLabel === "Fynix")).toBe(true);
  });

  it("refuses a supplier adding a client person, and refuses a client creating a group", async () => {
    const { supplier, client, agencyDb, clientDb } = actors();
    await expect(createGroup(agencyDb, supplier, { name: "Mixed", memberIds: [cast.clientActor.userId] })).rejects.toThrow(/cannot add/);
    await expect(createGroup(clientDb, client, { name: "Nope", memberIds: [] })).rejects.toThrow(/cannot create/);
  });

  it("lets members talk, hides surnames and contact details, and keeps outsiders out", async () => {
    const { fynix, supplier, client, fynixDb, agencyDb, clientDb, adminId } = actors();
    const conversationId = await createGroup(agencyDb, supplier, { name: "Share planning", memberIds: [adminId] });

    const info = await getGroupInfo(agencyDb, supplier, conversationId);
    expect(info).toMatchObject({ name: "Share planning", canManage: true, memberCount: 2 });
    if (info === null) throw new Error("No group");

    const sent = await postMessage(agencyDb, supplier, { conversationId, body: "Call me on 020 7946 0958 or sam@supplier.example" });
    expect(sent.body).not.toContain("0958");
    expect(sent.body).not.toContain("sam@supplier.example");
    expect(sent.senderName).toBe("Sam");
    expect(sent.senderRole).toBe("supplier");

    // Fynix reads it and sees the supplier by first name and role.
    expect((await listConversationMessages(fynixDb, fynix, conversationId)).length).toBe(1);
    const members = await listGroupMembers(fynixDb, fynix, info.groupId);
    // The seeded people are called "Person 1 of ...", so their first name is "Person"; the point is no surname or organisation is shown.
    expect(members.map((row) => `${row.firstName}:${row.roleLabel}`).sort()).toEqual(["Person:Fynix", "Person:Supplier"]);
    expect(JSON.stringify(members)).not.toMatch(/ORG-|@/);

    // A client who is not in the group sees no such conversation and no members, and cannot post to it.
    expect((await listConversations(clientDb, client)).some((row) => row.id === conversationId)).toBe(false);
    expect(await listGroupMembers(clientDb, client, info.groupId)).toEqual([]);
    expect(await getGroupInfo(clientDb, client, conversationId)).toBeNull();
    await expect(postMessage(clientDb, client, { conversationId, body: "Let me in" })).rejects.toThrow();
  });

  it("lets the creator and a Fynix admin manage a group, and anyone leave it", async () => {
    const { fynix, supplier, fynixDb, agencyDb, adminId } = actors();
    const conversationId = await createGroup(agencyDb, supplier, { name: "Original", memberIds: [adminId] });
    const info = await getGroupInfo(agencyDb, supplier, conversationId);
    if (info === null) throw new Error("No group");

    await renameGroup(agencyDb, supplier, { groupId: info.groupId, name: "Renamed" });
    expect((await getGroupInfo(fynixDb, fynix, conversationId))?.name).toBe("Renamed");

    // The Fynix admin may add a person only a Fynix admin may pick: a client.
    await addGroupMembers(fynixDb, fynix, { groupId: info.groupId, memberIds: [cast.clientActor.userId] });
    expect((await listGroupMembers(fynixDb, fynix, info.groupId)).some((row) => row.roleLabel === "Client")).toBe(true);

    // The supplier cannot add that client person, though it manages the group.
    await expect(addGroupMembers(agencyDb, supplier, { groupId: info.groupId, memberIds: [cast.clientActor.userId] })).rejects.toThrow(/cannot add/);

    await removeGroupMember(fynixDb, fynix, { groupId: info.groupId, userId: cast.clientActor.userId });
    expect((await listGroupMembers(fynixDb, fynix, info.groupId)).some((row) => row.roleLabel === "Client")).toBe(false);

    await leaveGroup(fynixDb, fynix, { groupId: info.groupId });
    expect(await getGroupInfo(fynixDb, fynix, conversationId)).toBeNull();

    await deleteGroup(agencyDb, supplier, { groupId: info.groupId });
    expect(await getGroupInfo(agencyDb, supplier, conversationId)).toBeNull();
  });

  it("lets a Fynix admin create a group, rename it and open a chat, each leaving an audit row", async () => {
    const { fynix, supplier, fynixDb, adminId } = actors();
    const owner = rig.dbs.owner.db;
    const conversationId = await createGroup(fynixDb, fynix, { name: "Fynix started", memberIds: [supplier.userId, cast.clientActor.userId] });
    const info = await getGroupInfo(fynixDb, fynix, conversationId);
    if (info === null) throw new Error("No group");
    await renameGroup(fynixDb, fynix, { groupId: info.groupId, name: "Fynix renamed" });
    const chatId = await openDirectChat(fynixDb, fynix, { userId: supplier.userId });
    await deleteGroup(fynixDb, fynix, { groupId: info.groupId });

    const rows = await owner.select({ action: auditLog.action, actor: auditLog.actorUserId }).from(auditLog);
    const actions = rows.filter((row) => row.actor === adminId).map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(["conversation.create", "chat_group.update", "conversation.open_direct", "chat_group.delete"]));
    expect(chatId).not.toBe(conversationId);
  });

  it("opens a one-to-one chat titled with the other person, reuses it, and keeps it unmanaged", async () => {
    const { fynix, supplier, fynixDb, agencyDb, adminId } = actors();
    const conversationId = await openDirectChat(agencyDb, supplier, { userId: adminId });
    expect(await openDirectChat(agencyDb, supplier, { userId: adminId })).toBe(conversationId);

    const mine = await getGroupInfo(agencyDb, supplier, conversationId);
    const theirs = await getGroupInfo(fynixDb, fynix, conversationId);
    expect(mine).toMatchObject({ kind: "direct", canManage: false, memberCount: 2 });
    expect(theirs).toMatchObject({ kind: "direct", canManage: false });
    // Each side is titled with the other person's first name, never the stored placeholder.
    expect(mine?.name).not.toBe("Direct chat");

    await expect(renameGroup(agencyDb, supplier, { groupId: mine?.groupId ?? "", name: "Mine" })).rejects.toThrow(/cannot change/);
    await expect(openDirectChat(agencyDb, supplier, { userId: cast.clientActor.userId })).rejects.toThrow(/cannot start a chat/);
    await expect(openDirectChat(agencyDb, supplier, { userId: supplier.userId })).rejects.toThrow(/cannot start a chat/);
  });
});
