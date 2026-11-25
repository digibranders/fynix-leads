import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { campaign, campaignHost, campaignShare, aliasIdentity, agreement, chatGroup, chatGroupMember, conversationMessage, hostHours, lead, leadReminder, member, notification, user } from "@/server/db/schema";
import type { Database } from "@/server/db/pool";
import { withTenantScope } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import { closeCampaign, reopenCampaign, updateCampaign } from "@/server/domain/campaigns";
import { publishAgreement } from "@/server/domain/agreements";
import { contestOutcome, fynixDecideContest } from "@/server/domain/contests";
import { fynixAnswerForClient, fynixMarkLost } from "@/server/domain/fynix-lead-actions";
import { addGroupMembers, createGroup, listGroupCandidates, listMixedGroups } from "@/server/domain/groups";
import { withdrawLead } from "@/server/domain/lead-drafts";
import { sendLeadReminders, sweepLeads, dueReminders } from "@/server/domain/lead-sweep";
import { clientReviewLead, decideLead, fynixOverturnRejection, listClientLeads, submitLead } from "@/server/domain/leads";
import { fynixRecordMeetingOutcome, listClientMeetings, recordMeetingOutcome } from "@/server/domain/meetings";
import { conversationForLead, getOrCreateLeadConversation, listConversations, markConversationRead, markNotificationRead, openThreadWithFynix, postMessage, type MessagingActor } from "@/server/domain/messaging";
import { countUnreadMessages, countUnreadNotices, listNotices, loadShellCounts, markAllNoticesRead, markNoticeRead } from "@/server/domain/notices";
import { pickPostponement, proposePostponement } from "@/server/domain/postponement";
import { requestRejectionReview } from "@/server/domain/rejection-reviews";
import { searchEverything } from "@/server/domain/search";
import { createPartnerAgency } from "@/server/domain/coordinators";
import { agreeNumbers, refusal } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

/**
 * Phase 5 chunk A, as the roles the app really runs: notices written at every lead event for the right people only and never for the person who acted,
 * the reminders and the automatic acceptance in the app, the unread counts, chat groups of one side, the threads of Fynix and of a lead, and the search.
 */
const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});

const PROSPECT_PHONE = "+44 7911 123456";

interface Cast {
  readonly campaignId: string;
  readonly clientActor: TenantActor;
  readonly clientColleague: TenantActor;
  readonly coordinator: TenantActor;
  readonly coordinatorColleague: TenantActor;
  readonly partner: TenantActor;
  readonly otherAgency: TenantActor;
  readonly otherClient: TenantActor;
  readonly fynixAdmin: string;
  readonly fynixStaff: string;
  readonly hostMemberId: string;
  readonly coordinatorAlias: string;
  readonly partnerAlias: string;
  readonly partnerOrgId: string;
}

let cast: Cast;
let counter = 0;
const clientDb = () => rig.dbs.roles.leads_client.db;
const agencyDb = () => rig.dbs.roles.leads_agency.db;
const fynixDb = () => rig.dbs.roles.leads_fynix.db;
const ownerDb = () => rig.dbs.owner.db;
const asMessaging = (actor: TenantActor): MessagingActor => ({ userId: actor.userId, orgId: actor.orgId, orgKind: actor.orgKind, role: actor.role });
const fynixMessaging = (userId: string): MessagingActor => ({ userId, orgKind: "fynix", role: "manager" });
const asTenant = <T>(db: Database, actor: TenantActor, work: Parameters<typeof withTenantScope<T>>[2]) => withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, work);

beforeEach(async () => {
  const world = await rig.reset();
  counter = 0;
  const owner = ownerDb();
  await owner.update(campaign).set({ status: "active", timeZone: "Europe/London" });
  const target = world.campaigns.find((row) => row.agency.id === world.brightpath.id);
  if (target === undefined) throw new Error("The seed has no campaign served by Brightpath");
  const person = (orgId: string) => {
    const found = world.users.find((candidate) => candidate.organisation.id === orgId);
    if (found === undefined) throw new Error("The seed is missing a person");
    return found;
  };
  const memberOf = async (userId: string): Promise<string> => {
    const [row] = await owner.select({ id: member.id }).from(member).where(eq(member.userId, userId));
    if (row === undefined) throw new Error("No member");
    return row.id;
  };
  const addPerson = async (orgId: string, orgKind: "client" | "agency", name: string, email: string, role: "member" | "manager" = "member") => {
    const [created] = await owner.insert(user).values({ email, name }).returning({ id: user.id });
    if (created === undefined) throw new Error("No user");
    const [row] = await owner.insert(member).values({ userId: created.id, orgId, orgKind, role, displayName: name }).returning({ id: member.id });
    if (row === undefined) throw new Error("No member");
    return { userId: created.id, memberId: row.id };
  };
  const clientUser = person(target.client.id);
  const coordinatorUser = person(world.brightpath.id);
  await owner.update(member).set({ role: "manager" }).where(eq(member.userId, clientUser.id));
  await owner.update(member).set({ role: "manager" }).where(eq(member.userId, coordinatorUser.id));
  const clientMember = await memberOf(clientUser.id);
  const coordinatorMember = await memberOf(coordinatorUser.id);
  await owner.insert(campaignHost).values({ campaignId: target.id, clientOrgId: target.client.id, memberId: clientMember, jobTitle: "Chief Operating Officer" });
  for (const weekday of [1, 2, 3, 4, 5]) await owner.insert(hostHours).values({ memberId: clientMember, timeZone: "Europe/London", weekday, startMinute: 0, endMinute: 1440 });
  const admin = world.users[0];
  if (admin === undefined) throw new Error("No Fynix admin");
  await owner.insert(agreement).values({ campaignId: target.id, party: "client", version: 1, monthlyTarget: 12, totalTarget: 72, createdBy: await memberOf(admin.id) });
  await owner.insert(campaignShare).values({ campaignId: target.id, agencyOrgId: world.brightpath.id, monthlyShare: 5 }).onConflictDoNothing();
  const verifiedAlias = async (memberId: string, displayName: string, email: string, ref: string): Promise<string> => {
    const [row] = await owner
      .insert(aliasIdentity)
      .values({ publicRef: ref, memberId, clientOrgId: target.client.id, displayName, jobTitle: "Business development", aliasEmail: email, verifiedAt: new Date(), status: "active" })
      .returning({ id: aliasIdentity.id });
    if (row === undefined) throw new Error("No alias");
    return row.id;
  };
  const coordinatorAlias = await verifiedAlias(coordinatorMember, "Lena Hartmann", "lena@brand.example", "ALI-3M2K");

  const partnerOrg = await createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: world.brightpath.id, name: "Ridgeway Partner Ltd" });
  const partnerPerson = await addPerson(partnerOrg.id, "agency", "Pia Ridgeway", "pia@ridgeway.example", "manager");
  await owner.insert(campaignShare).values({ campaignId: target.id, agencyOrgId: partnerOrg.id, monthlyShare: 3 });
  const partnerAlias = await verifiedAlias(partnerPerson.memberId, "Piet Ridge", "piet@ridgeway-brand.example", "ALI-9R4T");

  const clientColleague = await addPerson(target.client.id, "client", "Colin Kestrel", "colin@kestrel.example");
  const coordinatorColleague = await addPerson(world.brightpath.id, "agency", "Cora Bright", "cora@brightpath.example");

  const otherAgencyUser = person(world.northgate.id);
  const otherClientUser = person(world.halden.id);
  await owner.update(member).set({ role: "manager" }).where(eq(member.userId, otherAgencyUser.id));
  await owner.update(member).set({ role: "manager" }).where(eq(member.userId, otherClientUser.id));
  const fynixStaff = world.users.find((candidate) => candidate.organisation.kind === "fynix" && candidate.role === "member");
  if (fynixStaff === undefined) throw new Error("No Fynix staff");
  cast = {
    campaignId: target.id,
    clientActor: { userId: clientUser.id, orgId: target.client.id, orgKind: "client", role: "manager" },
    clientColleague: { userId: clientColleague.userId, orgId: target.client.id, orgKind: "client", role: "member" },
    coordinator: { userId: coordinatorUser.id, orgId: world.brightpath.id, orgKind: "agency", role: "manager" },
    coordinatorColleague: { userId: coordinatorColleague.userId, orgId: world.brightpath.id, orgKind: "agency", role: "member" },
    partner: { userId: partnerPerson.userId, orgId: partnerOrg.id, orgKind: "agency", role: "manager" },
    otherAgency: { userId: otherAgencyUser.id, orgId: world.northgate.id, orgKind: "agency", role: "manager" },
    otherClient: { userId: otherClientUser.id, orgId: world.halden.id, orgKind: "client", role: "manager" },
    fynixAdmin: admin.id,
    fynixStaff: fynixStaff.id,
    hostMemberId: clientMember,
    coordinatorAlias,
    partnerAlias,
    partnerOrgId: partnerOrg.id,
  };
});

function nextWeekdayAt(hour: number, daysAhead: number): string {
  const date = new Date(Date.now() + daysAhead * 86_400_000);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

interface Sent {
  readonly leadId: string;
  readonly publicRef: string;
  readonly time: string;
}

/** An agency submits a lead whose prospect has an email and a phone, so a notice that leaked either would show. */
async function sent(from: "coordinator" | "partner" = "coordinator", time = nextWeekdayAt(10, 3)): Promise<Sent> {
  counter += 1;
  const sender = from === "coordinator" ? cast.coordinator : cast.partner;
  const email = `marta${counter}@nordvik-cold.example`;
  await submitLead(agencyDb(), rig.deps(), sender, {
    campaignId: cast.campaignId,
    aliasIdentityId: from === "coordinator" ? cast.coordinatorAlias : cast.partnerAlias,
    hostMemberId: cast.hostMemberId,
    prospectName: `Marta Lindqvist ${counter}`,
    prospectTitle: "Head of Logistics",
    prospectCompany: `Nordvik Cold Chain ${counter}`,
    prospectDomain: "nordvik-cold.example",
    prospectLinkedinUrl: `https://www.linkedin.com/in/marta${counter}`,
    prospectEmail: email,
    prospectPhone: PROSPECT_PHONE,
    bantBudget: "Confirmed",
    bantAuthority: "Signs off",
    bantNeed: "Replacing a manual process",
    bantTimeline: "One quarter",
    proposedTimes: [time, nextWeekdayAt(14, 4)],
  });
  const created = (await listClientLeads(clientDb(), cast.clientActor)).find((row) => row.prospectEmail === email);
  if (created === undefined) throw new Error("No lead");
  return { leadId: created.id, publicRef: created.publicRef, time };
}

async function booked(from: "coordinator" | "partner" = "coordinator") {
  const one = await sent(from);
  await clientReviewLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, action: "accept", selectedMeetingTime: one.time });
  const meeting = (await listClientMeetings(clientDb(), cast.clientActor)).find((row) => row.leadId === one.leadId);
  if (meeting === undefined) throw new Error("No meeting");
  return { ...one, meetingId: meeting.id };
}

/** Every notice of a lead, as the owner reads it: who got which kind. */
async function noticeMap(leadId: string): Promise<Map<string, string[]>> {
  const rows = await ownerDb().select({ userId: notification.userId, kind: notification.kind }).from(notification).where(eq(notification.leadId, leadId));
  const map = new Map<string, string[]>();
  for (const row of rows) map.set(row.userId, [...(map.get(row.userId) ?? []), row.kind]);
  return map;
}
const recipients = (map: Map<string, string[]>, kind: string): string[] => [...map.entries()].filter(([, kinds]) => kinds.includes(kind)).map(([id]) => id).sort();
const ids = (...people: readonly (TenantActor | string)[]): string[] => people.map((entry) => (typeof entry === "string" ? entry : entry.userId)).sort();
/** Fresh start for the next step: clears notices so each step shows only its own. */
const clearNotices = () => ownerDb().delete(notification);

async function denied(work: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await work;
  } catch (error) {
    const messages: string[] = [];
    for (let current: unknown = error; current instanceof Error; current = current.cause) messages.push(current.message);
    expect(messages.join(" | ")).toMatch(pattern);
    return;
  }
  throw new Error(`Expected a refusal matching ${pattern}, but the statement was allowed.`);
}

describe("who may write a notice", () => {
  it("lets no tenant insert a notice for anyone, itself included", async () => {
    const insert = (actor: TenantActor, db: Database, target: string) =>
      asTenant(db, actor, (tx) => tx.execute(sql`insert into notification (user_id, kind, title, body, link) values (${target}::uuid, 'general', 'Hello', 'A notice', '/')`));
    await denied(insert(cast.clientActor, clientDb(), cast.coordinator.userId), /permission denied for table notification/);
    await denied(insert(cast.clientActor, clientDb(), cast.clientActor.userId), /permission denied for table notification/);
    await denied(insert(cast.coordinator, agencyDb(), cast.clientActor.userId), /permission denied for table notification/);
    await denied(asTenant(agencyDb(), cast.coordinator, (tx) => tx.execute(sql`select public.app_notice_insert(null, ${cast.campaignId}::uuid, null, array['client'], 'general', 'x', 'x', 'campaign', null)`)), /permission denied for function app_notice_insert/);
  });

  it("refuses a notice about a lead that is not the caller's, as every other organisation, and as nobody at all", async () => {
    const one = await sent();
    const call = (actor: TenantActor, db: Database) =>
      asTenant(db, actor, (tx) => tx.execute(sql`select public.app_notify_lead(${one.leadId}::uuid, array['client', 'source', 'coordinator', 'fynix'], 'general', 'Hello', 'A notice')`));
    await denied(call(cast.otherAgency, agencyDb()), /domain:not-authorised/);
    await denied(call(cast.otherClient, clientDb()), /domain:not-authorised/);
    expect(await ownerDb().select({ id: notification.id }).from(notification).where(eq(notification.title, "Hello"))).toEqual([]);
    // Nobody is signed in: no scope, no user.
    await denied(rig.dbs.roles.leads_client.db.execute(sql`select public.app_notify_lead(${one.leadId}::uuid, array['fynix'], 'general', 'Hello', 'A notice')`), /domain:not-authorised/);
  });

  it("never reaches a person outside the lead, whatever the audience says", async () => {
    const one = await sent("partner");
    await asTenant(agencyDb(), cast.partner, (tx) => tx.execute(sql`select public.app_notify_lead(${one.leadId}::uuid, array['client', 'client_managers', 'source', 'coordinator', 'partner_coordinator', 'coordinator_managers', 'shared_agencies', 'fynix'], 'general', 'Hello {ref}', 'From {company}')`));
    const rows = await ownerDb().select({ userId: notification.userId, title: notification.title, body: notification.body }).from(notification).where(eq(notification.kind, "general"));
    const allowed = new Set([cast.clientActor.userId, cast.clientColleague.userId, cast.coordinator.userId, cast.coordinatorColleague.userId, cast.fynixAdmin, cast.fynixStaff]);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(allowed.has(row.userId)).toBe(true);
    expect(rows.some((row) => row.userId === cast.partner.userId)).toBe(false);
    expect(rows.some((row) => row.userId === cast.otherClient.userId || row.userId === cast.otherAgency.userId)).toBe(false);
    expect(rows[0]?.title).toBe(`Hello ${one.publicRef}`);
    expect(rows[0]?.body).toBe("From Nordvik Cold Chain 1");
  });
});

describe("notices at every lead event", () => {
  it("tells the client people and Fynix about a submitted lead, the coordinator too when a partner agency sent it, and never the sender", async () => {
    const own = await sent("coordinator");
    let map = await noticeMap(own.leadId);
    expect(recipients(map, "lead_submitted")).toEqual(ids(cast.clientActor, cast.clientColleague, cast.fynixAdmin, cast.fynixStaff));

    const viaPartner = await sent("partner");
    map = await noticeMap(viaPartner.leadId);
    expect(recipients(map, "lead_submitted")).toEqual(ids(cast.clientActor, cast.clientColleague, cast.coordinator, cast.coordinatorColleague, cast.fynixAdmin, cast.fynixStaff));
    expect(map.has(cast.partner.userId)).toBe(false);
  });

  it("writes notices that open the lead in each portal and never hold the prospect's email or phone", async () => {
    const one = await booked("partner");
    await recordMeetingOutcome(clientDb(), rig.deps(), cast.clientActor, { meetingId: one.meetingId, outcome: "held" });
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, decision: "reject", note: `Call Marta on ${PROSPECT_PHONE} or write to marta1@nordvik-cold.example, not a fit` });
    const rows = await ownerDb().select().from(notification).where(eq(notification.leadId, one.leadId));
    expect(rows.length).toBeGreaterThan(8);
    for (const row of rows) {
      const written = `${row.title} ${row.body} ${row.link}`;
      expect(written).not.toContain("marta1@nordvik-cold.example");
      expect(written).not.toContain("7911");
      expect(written).not.toContain("123456");
      expect(written).not.toMatch(/[\u2013\u2014]/);
      expect(row.campaignId).toBe(cast.campaignId);
    }
    const linkOf = (userId: string) => rows.find((row) => row.userId === userId)?.link;
    expect(linkOf(cast.clientActor.userId)).toBe(`/client/leads/${one.publicRef}`);
    expect(linkOf(cast.coordinator.userId)).toBe(`/coordinator/leads/${one.publicRef}`);
    expect(linkOf(cast.partner.userId)).toBe(`/agency/leads/${one.publicRef}`);
    expect(linkOf(cast.fynixAdmin)).toBe(`/fynix/leads/${one.publicRef}`);
    const fynixRow = rows.find((row) => row.userId === cast.fynixAdmin);
    expect(fynixRow?.orgId).toBeNull();
    expect(rows.find((row) => row.userId === cast.partner.userId)?.orgId).toBe(cast.partnerOrgId);
  });

  it("tells every side, bar the client who acted, when a time is picked or proposed", async () => {
    const one = await sent();
    await clientReviewLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, action: "propose_times", proposedTimes: [nextWeekdayAt(9, 5)] });
    let map = await noticeMap(one.leadId);
    expect(recipients(map, "times_proposed")).toEqual(ids(cast.coordinator, cast.coordinatorColleague, cast.fynixAdmin, cast.fynixStaff));
    await clearNotices();
    await clientReviewLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, action: "accept", selectedMeetingTime: nextWeekdayAt(9, 5) });
    map = await noticeMap(one.leadId);
    expect(recipients(map, "meeting_scheduled")).toEqual(ids(cast.clientColleague, cast.coordinator, cast.coordinatorColleague, cast.fynixAdmin, cast.fynixStaff));
    const meetingId = (await ownerDb().select({ id: notification.meetingId }).from(notification).where(eq(notification.kind, "meeting_scheduled")))[0]?.id;
    expect(meetingId).toBeTruthy();
  });

  it("tells the other side when a meeting is postponed and when it moves", async () => {
    const one = await booked();
    await clearNotices();
    await proposePostponement(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, proposedTimes: [nextWeekdayAt(11, 6)] });
    let map = await noticeMap(one.leadId);
    expect(recipients(map, "times_proposed")).toEqual(ids(cast.clientActor, cast.clientColleague, cast.fynixAdmin, cast.fynixStaff));
    const proposal = (await asTenant(clientDb(), cast.clientActor, (tx) => tx.execute<{ id: string }>(sql`select id from meeting_reschedule where meeting_id = ${one.meetingId}::uuid`))).rows[0];
    await clearNotices();
    await pickPostponement(clientDb(), rig.deps(), cast.clientActor, { rescheduleId: proposal?.id, pickedTime: nextWeekdayAt(11, 6) });
    map = await noticeMap(one.leadId);
    expect(recipients(map, "meeting_postponed")).toEqual(ids(cast.clientColleague, cast.coordinator, cast.coordinatorColleague, cast.fynixAdmin, cast.fynixStaff));
  });

  it("tells the supply side and Fynix about an early rejection with the note from Client, a withdrawal the client side and Fynix, and everyone about a lost lead", async () => {
    const early = await booked();
    await clearNotices();
    await clientReviewLead(clientDb(), rig.deps(), cast.clientActor, { leadId: early.leadId, action: "decline", declineReason: "We changed plans" });
    let map = await noticeMap(early.leadId);
    expect(recipients(map, "lead_rejected")).toEqual(ids(cast.coordinator, cast.coordinatorColleague, cast.fynixAdmin, cast.fynixStaff));
    const supplyBody = (await ownerDb().select({ body: notification.body }).from(notification).where(and(eq(notification.userId, cast.coordinator.userId), eq(notification.leadId, early.leadId))))[0]?.body;
    expect(supplyBody).toContain("Note from Client: We changed plans");

    const withdrawn = await sent("partner");
    await clearNotices();
    await withdrawLead(agencyDb(), rig.deps(), cast.partner, { leadId: withdrawn.leadId, note: "The prospect asked us to stop" });
    map = await noticeMap(withdrawn.leadId);
    expect(recipients(map, "lead_withdrawn")).toEqual(ids(cast.clientActor, cast.clientColleague, cast.coordinator, cast.coordinatorColleague, cast.fynixAdmin, cast.fynixStaff));

    const lost = await booked();
    await clearNotices();
    await fynixMarkLost(rig.deps(), rig.actor, { leadId: lost.leadId, note: "Closed by Fynix after a call" });
    map = await noticeMap(lost.leadId);
    expect(recipients(map, "lead_lost")).toEqual(ids(cast.clientActor, cast.clientColleague, cast.coordinator, cast.coordinatorColleague, cast.fynixStaff));
  });

  it("asks the client to decide when a meeting is held, whoever records it, and tells the other sides", async () => {
    const one = await booked();
    await clearNotices();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, outcome: "held" });
    const map = await noticeMap(one.leadId);
    expect(recipients(map, "decision_needed")).toEqual(ids(cast.clientActor, cast.clientColleague));
    expect(recipients(map, "outcome_recorded")).toEqual(ids(cast.coordinatorColleague, cast.fynixAdmin, cast.fynixStaff));
    expect(map.has(cast.coordinator.userId)).toBe(false);

    const byClient = await booked();
    await clearNotices();
    await recordMeetingOutcome(clientDb(), rig.deps(), cast.clientActor, { meetingId: byClient.meetingId, outcome: "held" });
    const second = await noticeMap(byClient.leadId);
    // The colleague still has to decide; the person who recorded it is the only one left out.
    expect(recipients(second, "decision_needed")).toEqual(ids(cast.clientColleague));

    const byFynix = await booked();
    await clearNotices();
    await fynixRecordMeetingOutcome(fynixDb(), rig.deps(), rig.actor, { meetingId: byFynix.meetingId, outcome: "client_no_show" });
    const third = await noticeMap(byFynix.leadId);
    expect(recipients(third, "outcome_recorded")).toEqual(ids(cast.clientActor, cast.clientColleague, cast.coordinator, cast.coordinatorColleague, cast.fynixStaff));
  });

  it("tells the supply side and Fynix about an accept or a reject with the note, Fynix alone about a review, and the supply side when Fynix overturns", async () => {
    const accepted = await booked();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: accepted.meetingId, outcome: "held" });
    await clearNotices();
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: accepted.leadId, decision: "accept", note: "A strong fit for us" });
    let map = await noticeMap(accepted.leadId);
    expect(recipients(map, "lead_accepted")).toEqual(ids(cast.coordinator, cast.coordinatorColleague, cast.fynixAdmin, cast.fynixStaff));

    const rejected = await booked();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: rejected.meetingId, outcome: "held" });
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: rejected.leadId, decision: "reject", note: "Wrong industry" });
    await clearNotices();
    await requestRejectionReview(agencyDb(), rig.deps(), cast.coordinator, { leadId: rejected.leadId, note: "They fit the brief" });
    map = await noticeMap(rejected.leadId);
    expect(recipients(map, "review_requested")).toEqual(ids(cast.fynixAdmin, cast.fynixStaff));
    await clearNotices();
    await fynixOverturnRejection(fynixDb(), rig.deps(), rig.actor, { leadId: rejected.leadId, note: "The brief says logistics" });
    map = await noticeMap(rejected.leadId);
    expect(recipients(map, "rejection_overturned")).toEqual(ids(cast.coordinator, cast.coordinatorColleague));
    expect(map.has(cast.clientActor.userId)).toBe(false);
  });

  it("tells everyone about a contest and its decision, and a client about Fynix answering for it", async () => {
    const one = await booked();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, outcome: "prospect_no_show" });
    await clearNotices();
    await contestOutcome(clientDb(), rig.deps(), cast.clientActor, { meetingId: one.meetingId, note: "The prospect did attend" });
    let map = await noticeMap(one.leadId);
    expect(recipients(map, "outcome_contested")).toEqual(ids(cast.clientColleague, cast.coordinator, cast.coordinatorColleague, cast.fynixAdmin, cast.fynixStaff));
    await clearNotices();
    await fynixDecideContest(rig.deps(), rig.actor, one.leadId, "held", "The room record shows the prospect");
    map = await noticeMap(one.leadId);
    expect(recipients(map, "contest_decided")).toEqual(ids(cast.clientActor, cast.clientColleague, cast.coordinator, cast.coordinatorColleague, cast.fynixStaff));

    const second = await sent();
    await clearNotices();
    await fynixAnswerForClient(rig.deps(), rig.actor, { leadId: second.leadId, answer: "pick_time", selectedMeetingTime: second.time, note: "The client agreed by phone" });
    map = await noticeMap(second.leadId);
    expect(recipients(map, "meeting_scheduled")).toEqual(ids(cast.clientActor, cast.clientColleague, cast.coordinator, cast.coordinatorColleague, cast.fynixStaff));
  });

  it("tells the parties of a campaign when it goes active or closes, and the managers when an agreement version is published", async () => {
    await ownerDb().update(campaign).set({ status: "draft" }).where(eq(campaign.id, cast.campaignId));
    await agreeNumbers(rig, cast.campaignId);
    await clearNotices();
    await updateCampaign(rig.deps(), rig.actor, cast.campaignId, { status: "active" });
    const active = await ownerDb().select({ userId: notification.userId }).from(notification).where(eq(notification.kind, "campaign_active"));
    expect(active.map((row) => row.userId).sort()).toEqual(ids(cast.clientActor, cast.clientColleague, cast.coordinator, cast.coordinatorColleague, cast.partner, cast.fynixStaff));
    await clearNotices();
    await closeCampaign(rig.deps(), rig.actor, cast.campaignId, "Finished");
    const closed = await ownerDb().select({ userId: notification.userId, link: notification.link }).from(notification).where(eq(notification.kind, "campaign_closed"));
    const who = closed.map((row) => row.userId).sort();
    expect(who).toEqual(ids(cast.clientActor, cast.clientColleague, cast.coordinator, cast.coordinatorColleague, cast.partner, cast.fynixStaff));
    expect(closed.find((row) => row.userId === cast.clientActor.userId)?.link).toBe("/client/campaigns");
    expect(closed.find((row) => row.userId === cast.partner.userId)?.link).toBe("/agency/campaigns");
    await reopenCampaign(rig.deps(), rig.actor, cast.campaignId);
    await ownerDb().update(campaign).set({ status: "active", closedAt: null }).where(eq(campaign.id, cast.campaignId));
    await clearNotices();
    await publishAgreement(rig.deps(), rig.actor, { campaignId: cast.campaignId, monthlyTarget: 14, totalTarget: 84 });
    const published = await ownerDb().select({ userId: notification.userId, link: notification.link }).from(notification).where(eq(notification.kind, "agreement_published"));
    expect(published.map((row) => row.userId).sort()).toEqual(ids(cast.clientActor, cast.coordinator));
    expect(published.find((row) => row.userId === cast.coordinator.userId)?.link).toBe("/coordinator/agreement");
  });

  it("lets a person read and mark read only their own notices, Fynix too", async () => {
    await sent();
    const clientNotices = await asTenant(clientDb(), cast.clientActor, (tx) => tx.execute<{ user_id: string }>(sql`select user_id from notification`));
    expect(clientNotices.rows.every((row) => row.user_id === cast.clientActor.userId)).toBe(true);
    expect(clientNotices.rows).toHaveLength(1);
    const otherNotices = await asTenant(clientDb(), cast.otherClient, (tx) => tx.execute(sql`select id from notification`));
    expect(otherNotices.rows).toEqual([]);
    const [mine] = await ownerDb().select({ id: notification.id }).from(notification).where(eq(notification.userId, cast.clientActor.userId));
    const [colleagues] = await ownerDb().select({ id: notification.id }).from(notification).where(eq(notification.userId, cast.clientColleague.userId));
    if (mine === undefined || colleagues === undefined) throw new Error("No notices");
    expect((await refusal(markNotificationRead(clientDb(), asMessaging(cast.clientActor), colleagues.id))).code).toBe("not-found");
    expect((await markNotificationRead(clientDb(), asMessaging(cast.clientActor), mine.id))?.readAt).toBeInstanceOf(Date);
    // Fynix marks its own notice read, which the audit rule must allow.
    const [fynixNotice] = await ownerDb().select({ id: notification.id }).from(notification).where(eq(notification.userId, cast.fynixAdmin));
    if (fynixNotice === undefined) throw new Error("No Fynix notice");
    expect((await markNotificationRead(fynixDb(), fynixMessaging(cast.fynixAdmin), fynixNotice.id))?.readAt).toBeInstanceOf(Date);
  });
});

describe("reminders and the automatic acceptance, in the app", () => {
  const outcomeAt = new Date("2026-12-01T12:00:00Z");
  const hoursAfter = (hours: number): Date => new Date(outcomeAt.getTime() + hours * 3_600_000);

  async function awaiting() {
    const one = await booked();
    rig.clock.now = outcomeAt;
    await recordMeetingOutcome(clientDb(), rig.deps(), cast.clientActor, { meetingId: one.meetingId, outcome: "held" });
    await clearNotices();
    return one;
  }
  const reminderRows = (leadId: string) => ownerDb().select().from(notification).where(and(eq(notification.leadId, leadId), eq(notification.kind, "decision_reminder")));

  it("tells every active client person how many hours are left, once per reminder, and stamps it sent in the same call", async () => {
    const one = await awaiting();
    const deps = rig.deps();
    expect(await sendLeadReminders(deps, hoursAfter(11))).toEqual([]);
    const first = await sendLeadReminders(deps, hoursAfter(13));
    expect(first.map((entry) => [entry.kind, entry.leadRef, entry.hoursLeft, entry.notified])).toEqual([["12h", one.publicRef, 35, 2]]);
    let rows = await reminderRows(one.leadId);
    expect(rows.map((row) => row.userId).sort()).toEqual(ids(cast.clientActor, cast.clientColleague));
    expect(rows[0]?.body).toContain("35 hours left");
    expect(rows[0]?.link).toBe(`/client/leads/${one.publicRef}`);
    // Idempotent, and the read-only list no longer holds it.
    expect(await sendLeadReminders(deps, hoursAfter(13.5))).toEqual([]);
    expect(await dueReminders(deps, hoursAfter(13.5))).toEqual([]);
    expect(await reminderRows(one.leadId)).toHaveLength(2);
    expect((await ownerDb().select().from(leadReminder).where(eq(leadReminder.leadId, one.leadId))).filter((entry) => entry.sentAt !== null)).toHaveLength(1);

    await sendLeadReminders(deps, hoursAfter(25));
    await sendLeadReminders(deps, hoursAfter(37));
    rows = await reminderRows(one.leadId);
    expect(rows.map((row) => row.body.split(" ")[0]).sort()).toEqual(["11", "11", "23", "23", "35", "35"]);
  });

  it("writes one notice, the latest, when several are due at once, and none once the client has answered", async () => {
    const late = await awaiting();
    const answered = await booked();
    await recordMeetingOutcome(clientDb(), rig.deps(), cast.clientActor, { meetingId: answered.meetingId, outcome: "held" });
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: answered.leadId, decision: "accept", note: "A good fit for us" });
    await clearNotices();
    const sentNow = await sendLeadReminders(rig.deps(), hoursAfter(37));
    expect(sentNow.filter((entry) => entry.leadId === late.leadId).map((entry) => entry.kind).sort()).toEqual(["12h", "24h", "36h"]);
    expect(sentNow.some((entry) => entry.leadId === answered.leadId)).toBe(false);
    const rows = await reminderRows(late.leadId);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.body).toContain("11 hours left");
    expect(await reminderRows(answered.leadId)).toEqual([]);
  });

  it("tells everyone on the lead when it is accepted automatically, in the same call as the acceptance, and only once", async () => {
    const one = await awaiting();
    const deps = rig.deps();
    expect(await sweepLeads(deps, hoursAfter(47))).toEqual([]);
    expect(await sweepLeads(deps, hoursAfter(48))).toEqual([{ id: one.leadId, publicRef: one.publicRef }]);
    const map = await noticeMap(one.leadId);
    expect(recipients(map, "lead_auto_accepted")).toEqual(ids(cast.clientActor, cast.clientColleague, cast.coordinator, cast.coordinatorColleague, cast.fynixAdmin, cast.fynixStaff));
    expect(await sweepLeads(deps, hoursAfter(50))).toEqual([]);
    expect((await ownerDb().select().from(notification).where(eq(notification.kind, "lead_auto_accepted")))).toHaveLength(6);
    const [row] = await ownerDb().select({ stage: lead.stage }).from(lead).where(eq(lead.id, one.leadId));
    expect(row?.stage).toBe("accepted");
  });

  it("is refused to every tenant role", async () => {
    await denied(asTenant(clientDb(), cast.clientActor, (tx) => tx.execute(sql`select * from public.app_send_lead_reminders(now())`)), /permission denied for function app_send_lead_reminders/);
    await denied(asTenant(agencyDb(), cast.coordinator, (tx) => tx.execute(sql`select * from public.app_send_lead_reminders(now())`)), /permission denied for function app_send_lead_reminders/);
  });
});

describe("unread counts", () => {
  it("counts a person's unread notices, not the notices of messages, and falls as they are opened", async () => {
    const one = await sent();
    expect(await countUnreadNotices(clientDb(), asMessaging(cast.clientActor))).toBe(1);
    expect(await countUnreadNotices(clientDb(), asMessaging(cast.otherClient))).toBe(0);
    expect(await countUnreadNotices(fynixDb(), fynixMessaging(cast.fynixAdmin))).toBe(1);
    expect(await countUnreadNotices(agencyDb(), asMessaging(cast.coordinator))).toBe(0);
    const [mine] = await ownerDb().select({ id: notification.id }).from(notification).where(and(eq(notification.userId, cast.clientActor.userId), eq(notification.leadId, one.leadId)));
    if (mine === undefined) throw new Error("No notice");
    await markNotificationRead(clientDb(), asMessaging(cast.clientActor), mine.id);
    expect(await countUnreadNotices(clientDb(), asMessaging(cast.clientActor))).toBe(0);
    // A message notice is the Messages badge's business.
    const thread = await openThreadWithFynix(clientDb(), asMessaging(cast.clientActor), { campaignId: cast.campaignId });
    await postMessage(clientDb(), asMessaging(cast.clientActor), { conversationId: thread.id, body: "Could we talk about the host hours?" });
    expect(await countUnreadNotices(fynixDb(), fynixMessaging(cast.fynixAdmin))).toBe(1);
  });

  it("counts the conversations where someone else wrote after the person last opened them, one query each", async () => {
    const thread = await openThreadWithFynix(clientDb(), asMessaging(cast.clientActor), { campaignId: cast.campaignId });
    expect(await countUnreadMessages(fynixDb(), fynixMessaging(cast.fynixAdmin))).toBe(0);
    await postMessage(clientDb(), asMessaging(cast.clientActor), { conversationId: thread.id, body: "Could we talk about the host hours?" });
    expect(await countUnreadMessages(fynixDb(), fynixMessaging(cast.fynixAdmin))).toBe(1);
    expect(await countUnreadMessages(fynixDb(), fynixMessaging(cast.fynixStaff))).toBe(1);
    expect(await countUnreadMessages(clientDb(), asMessaging(cast.clientActor))).toBe(0);
    expect(await countUnreadMessages(clientDb(), asMessaging(cast.clientColleague))).toBe(1);
    expect(await countUnreadMessages(clientDb(), asMessaging(cast.otherClient))).toBe(0);
    expect(await countUnreadMessages(agencyDb(), asMessaging(cast.coordinator))).toBe(0);
    await markConversationRead(fynixDb(), fynixMessaging(cast.fynixAdmin), thread.id);
    expect(await countUnreadMessages(fynixDb(), fynixMessaging(cast.fynixAdmin))).toBe(0);
    await postMessage(fynixDb(), fynixMessaging(cast.fynixAdmin), { conversationId: thread.id, body: "Yes, tomorrow at ten" });
    expect(await countUnreadMessages(clientDb(), asMessaging(cast.clientActor))).toBe(1);
    expect(await countUnreadMessages(fynixDb(), fynixMessaging(cast.fynixAdmin))).toBe(0);
  });

  it("writes the notices of a message for the other side, which a tenant could not do itself", async () => {
    const thread = await openThreadWithFynix(clientDb(), asMessaging(cast.clientActor), { campaignId: cast.campaignId });
    await postMessage(clientDb(), asMessaging(cast.clientActor), { conversationId: thread.id, body: "Could we talk about the host hours?" });
    let rows = await ownerDb().select().from(notification).where(eq(notification.kind, "message_received"));
    expect(rows.map((row) => row.userId).sort()).toEqual(ids(cast.fynixAdmin, cast.fynixStaff));
    expect(rows[0]?.link).toBe(`/fynix/inbox?conv=${thread.id}`);
    await clearNotices();
    await postMessage(fynixDb(), fynixMessaging(cast.fynixAdmin), { conversationId: thread.id, body: "Yes, tomorrow at ten" });
    rows = await ownerDb().select().from(notification).where(eq(notification.kind, "message_received"));
    expect(rows.map((row) => row.userId).sort()).toEqual(ids(cast.clientActor, cast.clientColleague));
    expect(rows[0]?.link).toBe(`/client/messages?conv=${thread.id}`);
    expect(rows[0]?.orgId).toBe(cast.clientActor.orgId);
  });
});

describe("chat groups of one side", () => {
  const supplyPeople = () => [cast.coordinator.userId, cast.coordinatorColleague.userId, cast.partner.userId];
  const create = (members: string[], name = "Chat") => createGroup(fynixDb(), fynixMessaging(cast.fynixAdmin), { name, memberIds: members });
  const groupRefused = async (work: Promise<unknown>) => {
    const error = await refusal(work);
    expect(error.code).toBe("not-authorised");
    expect(error.message).toMatch(/^A group holds Fynix and one side only/);
  };

  it("lets Fynix group Fynix people with one client, or with one coordinator and its agencies", async () => {
    await create([cast.fynixStaff, cast.clientActor.userId, cast.clientColleague.userId], "Kestrel");
    await create([cast.fynixStaff, ...supplyPeople()], "Brightpath and Ridgeway");
    await create([cast.fynixStaff], "Fynix only");
    expect(await listMixedGroups(fynixDb(), rig.actor)).toEqual([]);
  });

  it("refuses a group of a client with the supply side, in either order, and one of two clients or two coordinators", async () => {
    await groupRefused(create([cast.clientActor.userId, cast.coordinator.userId]));
    await groupRefused(create([cast.partner.userId, cast.clientColleague.userId, cast.fynixStaff]));
    await groupRefused(create([cast.clientActor.userId, cast.otherClient.userId]));
    await groupRefused(create([cast.coordinator.userId, cast.otherAgency.userId]));
    const groups = await ownerDb().select({ id: chatGroup.id }).from(chatGroup);
    expect(groups).toEqual([]);
  });

  it("refuses to add the other side to a group, and lets Fynix and the same side in", async () => {
    await create([cast.fynixStaff, cast.clientActor.userId], "Kestrel");
    const [group] = await ownerDb().select({ id: chatGroup.id }).from(chatGroup);
    if (group === undefined) throw new Error("No group");
    await groupRefused(addGroupMembers(fynixDb(), fynixMessaging(cast.fynixAdmin), { groupId: group.id, memberIds: [cast.coordinator.userId] }));
    await groupRefused(addGroupMembers(fynixDb(), fynixMessaging(cast.fynixAdmin), { groupId: group.id, memberIds: [cast.otherClient.userId] }));
    expect(await addGroupMembers(fynixDb(), fynixMessaging(cast.fynixAdmin), { groupId: group.id, memberIds: [cast.clientColleague.userId] })).toBe(1);
    const active = await ownerDb().select({ userId: chatGroupMember.userId }).from(chatGroupMember).where(eq(chatGroupMember.groupId, group.id));
    expect(active.map((row) => row.userId)).not.toContain(cast.coordinator.userId);
  });

  it("narrows the people offered to Fynix and the one side already chosen", async () => {
    const all = await listGroupCandidates(fynixDb(), fynixMessaging(cast.fynixAdmin));
    expect(all).toHaveLength(8);
    const afterClient = await listGroupCandidates(fynixDb(), fynixMessaging(cast.fynixAdmin), { chosen: [cast.clientActor.userId] });
    expect(afterClient.map((row) => row.roleLabel).filter((label) => label !== "Fynix")).toEqual(["Client", "Client"]);
    expect(afterClient.some((row) => row.userId === cast.otherClient.userId)).toBe(false);
    const afterPartner = await listGroupCandidates(fynixDb(), fynixMessaging(cast.fynixAdmin), { chosen: [cast.partner.userId] });
    expect(afterPartner.map((row) => row.roleLabel).filter((label) => label !== "Fynix").sort()).toEqual(["Agency", "Coordinator", "Coordinator"]);
    expect(afterPartner.some((row) => row.userId === cast.clientActor.userId || row.userId === cast.otherAgency.userId)).toBe(false);
    await create([cast.fynixStaff, cast.clientActor.userId], "Kestrel");
    const [group] = await ownerDb().select({ id: chatGroup.id }).from(chatGroup);
    const forGroup = await listGroupCandidates(fynixDb(), fynixMessaging(cast.fynixAdmin), { groupId: group?.id });
    expect(forGroup.map((row) => row.roleLabel).filter((label) => label !== "Fynix")).toEqual(["Client", "Client"]);
  });

  it("gives a coordinator its own people, its partner agencies and Fynix, and never a client person", async () => {
    const offered = await listGroupCandidates(agencyDb(), asMessaging(cast.coordinator));
    const offeredIds = offered.map((row) => row.userId);
    expect(offeredIds).toEqual(expect.arrayContaining([cast.coordinatorColleague.userId, cast.partner.userId, cast.fynixAdmin, cast.fynixStaff]));
    expect(offeredIds).not.toContain(cast.clientActor.userId);
    expect(offeredIds).not.toContain(cast.clientColleague.userId);
    expect(offeredIds).not.toContain(cast.otherAgency.userId);
    await createGroup(agencyDb(), asMessaging(cast.coordinator), { name: "Delivery", memberIds: [cast.partner.userId, cast.fynixStaff] });
    expect((await refusal(createGroup(agencyDb(), asMessaging(cast.coordinator), { name: "Mixed", memberIds: [cast.clientActor.userId] }))).code).toBe("not-authorised");
    expect((await refusal(createGroup(clientDb(), asMessaging(cast.clientActor), { name: "Mine", memberIds: [cast.fynixStaff] }))).code).toBe("not-authorised");
    // An agency is not offered anyone, as before: its hop is its coordinator.
    expect(await listGroupCandidates(agencyDb(), asMessaging(cast.partner))).toEqual([]);
  });

  it("lists the groups that already mix sides for the owner, changes nothing, and is for Fynix only", async () => {
    const owner = ownerDb();
    const [mixed] = await owner.insert(chatGroup).values({ publicRef: "GRP-AAAA", name: "Old mixed group", createdByUserId: cast.fynixAdmin }).returning({ id: chatGroup.id });
    if (mixed === undefined) throw new Error("No group");
    await owner.insert(chatGroupMember).values([cast.fynixAdmin, cast.clientActor.userId, cast.coordinator.userId].map((userId) => ({ groupId: mixed.id, userId, addedByUserId: cast.fynixAdmin })));
    await create([cast.fynixStaff, cast.clientActor.userId], "Fine group");
    const found = await listMixedGroups(fynixDb(), rig.staffActor);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ publicRef: "GRP-AAAA", name: "Old mixed group", memberCount: 3 });
    expect([...(found[0]?.sides ?? [])].sort()).toEqual(["Client: Kestrel Logistics Ltd", "Coordinator side: Brightpath Media Pvt Ltd"]);
    expect(await owner.select({ id: chatGroupMember.userId }).from(chatGroupMember).where(eq(chatGroupMember.groupId, mixed.id))).toHaveLength(3);
    await denied(asTenant(agencyDb(), cast.coordinator, (tx) => tx.execute(sql`select * from public.app_mixed_groups()`)), /permission denied for function app_mixed_groups/);
    await denied(asTenant(clientDb(), cast.clientActor, (tx) => tx.execute(sql`select * from public.app_mixed_groups()`)), /permission denied for function app_mixed_groups/);
  });
});

describe("threads", () => {
  it("carries the company's name on every Fynix thread, and none on a tenant's", async () => {
    const clientThread = await openThreadWithFynix(clientDb(), asMessaging(cast.clientActor), { campaignId: cast.campaignId, subject: "Host hours" });
    const supplyThread = await openThreadWithFynix(agencyDb(), asMessaging(cast.coordinator), { campaignId: cast.campaignId });
    const threads = await listConversations(fynixDb(), fynixMessaging(cast.fynixAdmin));
    expect(threads.find((row) => row.id === clientThread.id)?.counterpartyName).toBe("Kestrel Logistics Ltd");
    expect(threads.find((row) => row.id === supplyThread.id)?.counterpartyName).toBe("Brightpath Media Pvt Ltd");
    const own = await listConversations(clientDb(), asMessaging(cast.clientActor));
    expect(own.map((row) => row.id)).toEqual([clientThread.id]);
    expect(own[0]?.counterpartyName).toBeNull();
  });

  it("lets a client start a thread with Fynix once per campaign, for its own campaigns only, and a coordinator for its own", async () => {
    const first = await openThreadWithFynix(clientDb(), asMessaging(cast.clientActor), { campaignId: cast.campaignId });
    const again = await openThreadWithFynix(clientDb(), asMessaging(cast.clientColleague), { campaignId: cast.campaignId });
    expect(again.id).toBe(first.id);
    expect(first.side).toBe("client_fynix");
    const other = rig.world().campaigns.find((row) => row.id !== cast.campaignId && row.client.id !== cast.clientActor.orgId);
    if (other === undefined) throw new Error("No other campaign");
    expect((await refusal(openThreadWithFynix(clientDb(), asMessaging(cast.clientActor), { campaignId: other.id }))).code).toBe("not-found");
    expect((await refusal(openThreadWithFynix(agencyDb(), asMessaging(cast.partner), { campaignId: cast.campaignId }))).code).toBe("not-authorised");
    expect((await refusal(openThreadWithFynix(fynixDb(), fynixMessaging(cast.fynixAdmin), { campaignId: cast.campaignId }))).code).toBe("not-authorised");
    expect((await openThreadWithFynix(agencyDb(), asMessaging(cast.coordinatorColleague), { campaignId: cast.campaignId })).side).toBe("supplier_fynix");
  });

  it("makes one thread per lead and side, titled with the lead's reference, and keeps the two sides apart", async () => {
    const one = await sent();
    const clientThread = await getOrCreateLeadConversation(clientDb(), asMessaging(cast.clientActor), { leadId: one.leadId });
    const supplyThread = await getOrCreateLeadConversation(agencyDb(), asMessaging(cast.coordinator), { leadId: one.leadId });
    if (clientThread === null || supplyThread === null) throw new Error("No thread");
    expect(clientThread).toMatchObject({ side: "client_fynix", leadId: one.leadId, subject: `Lead ${one.publicRef}` });
    expect(supplyThread).toMatchObject({ side: "supplier_fynix", leadId: one.leadId, subject: `Lead ${one.publicRef}` });
    expect(clientThread.id).not.toBe(supplyThread.id);
    expect((await getOrCreateLeadConversation(clientDb(), asMessaging(cast.clientColleague), { leadId: one.leadId }))?.id).toBe(clientThread.id);
    expect((await getOrCreateLeadConversation(fynixDb(), fynixMessaging(cast.fynixStaff), { leadId: one.leadId, side: "client_fynix" }))?.id).toBe(clientThread.id);
    expect((await getOrCreateLeadConversation(fynixDb(), fynixMessaging(cast.fynixStaff), { leadId: one.leadId, side: "supplier_fynix" }))?.id).toBe(supplyThread.id);

    // The links for the record pages: each side finds its own thread, Fynix both.
    expect((await conversationForLead(clientDb(), asMessaging(cast.clientActor), one.leadId)).map((row) => row.id)).toEqual([clientThread.id]);
    expect((await conversationForLead(agencyDb(), asMessaging(cast.coordinator), one.leadId)).map((row) => row.id)).toEqual([supplyThread.id]);
    expect((await conversationForLead(fynixDb(), fynixMessaging(cast.fynixAdmin), one.leadId)).map((row) => row.side).sort()).toEqual(["client_fynix", "supplier_fynix"]);
    expect(await conversationForLead(clientDb(), asMessaging(cast.otherClient), one.leadId)).toEqual([]);
    expect(await conversationForLead(agencyDb(), asMessaging(cast.otherAgency), one.leadId)).toEqual([]);
    expect(await conversationForLead(agencyDb(), asMessaging(cast.partner), one.leadId)).toEqual([]);
  });

  it("gives a partner agency no thread with Fynix, and refuses a lead that is not the caller's and a draft", async () => {
    const one = await sent("partner");
    expect(await getOrCreateLeadConversation(agencyDb(), asMessaging(cast.partner), { leadId: one.leadId })).toBeNull();
    expect((await refusal(getOrCreateLeadConversation(clientDb(), asMessaging(cast.otherClient), { leadId: one.leadId }))).code).toBe("not-found");
    expect((await refusal(getOrCreateLeadConversation(agencyDb(), asMessaging(cast.otherAgency), { leadId: one.leadId }))).code).toBe("not-found");
    const [draft] = await ownerDb().select({ id: lead.id }).from(lead).where(eq(lead.id, one.leadId));
    await ownerDb().update(lead).set({ released: false, stage: "draft" }).where(eq(lead.id, draft?.id ?? one.leadId));
    expect((await refusal(getOrCreateLeadConversation(fynixDb(), fynixMessaging(cast.fynixAdmin), { leadId: one.leadId, side: "client_fynix" }))).code).toBe("invalid-lead-stage");
  });

  it("lets the lead thread carry messages the other side of the lead never reads", async () => {
    const one = await sent();
    const clientThread = await getOrCreateLeadConversation(clientDb(), asMessaging(cast.clientActor), { leadId: one.leadId });
    if (clientThread === null) throw new Error("No thread");
    await postMessage(clientDb(), asMessaging(cast.clientActor), { conversationId: clientThread.id, body: "Please call the prospect first" });
    expect(await ownerDb().select({ id: conversationMessage.id }).from(conversationMessage).where(eq(conversationMessage.conversationId, clientThread.id))).toHaveLength(1);
    expect((await listConversations(agencyDb(), asMessaging(cast.coordinator))).map((row) => row.id)).not.toContain(clientThread.id);
    expect((await refusal(postMessage(agencyDb(), asMessaging(cast.coordinator), { conversationId: clientThread.id, body: "Hello" }))).code).toMatch(/not-found|not-authorised/);
  });
});

describe("search", () => {
  it("finds a lead by reference, prospect and company for the sides that read it, five at most, and never by email or phone", async () => {
    const leads = [];
    for (let index = 0; index < 7; index += 1) leads.push(await sent());
    const first = leads[0];
    if (first === undefined) throw new Error("No lead");
    const byCompany = await searchEverything(clientDb(), asMessaging(cast.clientActor), "Nordvik Cold");
    expect(byCompany.leads).toHaveLength(5);
    expect(byCompany.leads[0]?.href).toMatch(/^\/client\/leads\/LD-/);
    expect((await searchEverything(clientDb(), asMessaging(cast.clientActor), first.publicRef.toLowerCase())).leads.map((row) => row.href)).toEqual([`/client/leads/${first.publicRef}`]);
    expect((await searchEverything(agencyDb(), asMessaging(cast.coordinator), "Marta Lindqvist 1")).leads[0]?.href).toBe(`/coordinator/leads/${first.publicRef}`);
    expect((await searchEverything(fynixDb(), fynixMessaging(cast.fynixAdmin), "Lindqvist 3")).leads[0]?.href).toMatch(/^\/fynix\/leads\/LD-/);
    expect((await searchEverything(clientDb(), asMessaging(cast.clientActor), "nordvik-cold.example")).leads).toEqual([]);
    expect((await searchEverything(clientDb(), asMessaging(cast.clientActor), PROSPECT_PHONE)).leads).toEqual([]);
    expect((await searchEverything(clientDb(), asMessaging(cast.otherClient), "Nordvik")).leads).toEqual([]);
    expect((await searchEverything(agencyDb(), asMessaging(cast.otherAgency), "Nordvik")).leads).toEqual([]);
    // A draft is not a lead yet.
    await ownerDb().update(lead).set({ released: false, stage: "draft" }).where(eq(lead.id, first.leadId));
    expect((await searchEverything(fynixDb(), fynixMessaging(cast.fynixAdmin), first.publicRef)).leads).toEqual([]);
  });

  it("takes % and _ literally and finds nothing for a short query", async () => {
    await sent();
    expect(await searchEverything(clientDb(), asMessaging(cast.clientActor), "N")).toEqual({ leads: [], people: [], companies: [] });
    expect((await searchEverything(clientDb(), asMessaging(cast.clientActor), "%%")).leads).toEqual([]);
    expect((await searchEverything(clientDb(), asMessaging(cast.clientActor), "Nord_ik")).leads).toEqual([]);
    expect((await refusal(searchEverything(clientDb(), asMessaging(cast.clientActor), "x".repeat(101)))).code).toBe("invalid-input");
  });

  it("never shows a client person to the supply side, or a supply person to a client, and shows each side its own", async () => {
    const clientQuery = "Colin Kestrel";
    expect((await searchEverything(agencyDb(), asMessaging(cast.coordinator), clientQuery)).people).toEqual([]);
    expect((await searchEverything(agencyDb(), asMessaging(cast.coordinator), "Kestrel")).people).toEqual([]);
    expect((await searchEverything(agencyDb(), asMessaging(cast.partner), clientQuery)).people).toEqual([]);
    expect((await searchEverything(agencyDb(), asMessaging(cast.otherAgency), clientQuery)).people).toEqual([]);
    expect((await searchEverything(clientDb(), asMessaging(cast.clientActor), "Cora Bright")).people).toEqual([]);
    expect((await searchEverything(clientDb(), asMessaging(cast.clientActor), "Pia Ridgeway")).people).toEqual([]);
    expect((await searchEverything(clientDb(), asMessaging(cast.otherClient), clientQuery)).people).toEqual([]);

    const own = await searchEverything(clientDb(), asMessaging(cast.clientActor), clientQuery);
    expect(own.people.map((row) => [row.label, row.href])).toEqual([["Colin Kestrel", "/client/team"]]);
    const coordinator = await searchEverything(agencyDb(), asMessaging(cast.coordinator), "Cora");
    expect(coordinator.people.map((row) => row.label)).toEqual(["Cora Bright"]);
    // A coordinator also finds the people of its partner agencies; a partner agency does not find the coordinator's.
    expect((await searchEverything(agencyDb(), asMessaging(cast.coordinator), "Pia Ridgeway")).people.map((row) => row.label)).toEqual(["Pia Ridgeway"]);
    expect((await searchEverything(agencyDb(), asMessaging(cast.partner), "Cora")).people).toEqual([]);
    const fynix = await searchEverything(fynixDb(), fynixMessaging(cast.fynixAdmin), "Colin");
    expect(fynix.people[0]).toMatchObject({ label: "Colin Kestrel", href: expect.stringMatching(/^\/fynix\/clients\/ORG-/) });
  });

  it("shows each role the companies it may know: a client only its own, the supply side its own side and the clients it serves, Fynix all", async () => {
    expect((await searchEverything(clientDb(), asMessaging(cast.clientActor), "Brightpath")).companies).toEqual([]);
    expect((await searchEverything(clientDb(), asMessaging(cast.clientActor), "Halden")).companies).toEqual([]);
    expect((await searchEverything(clientDb(), asMessaging(cast.clientActor), "Kestrel")).companies.map((row) => row.label)).toEqual(["Kestrel Logistics Ltd"]);
    expect((await searchEverything(agencyDb(), asMessaging(cast.coordinator), "Ridgeway")).companies.map((row) => [row.label, row.detail])).toEqual([["Ridgeway Partner Ltd", "Partner agency"]]);
    expect((await searchEverything(agencyDb(), asMessaging(cast.coordinator), "Northgate")).companies).toEqual([]);
    // The coordinator serves two clients and knows both names; the partner agency holds a share on one campaign only.
    expect((await searchEverything(agencyDb(), asMessaging(cast.coordinator), "Halden")).companies.map((row) => row.label)).toEqual(["Halden Foods Ltd"]);
    expect((await searchEverything(agencyDb(), asMessaging(cast.partner), "Halden")).companies).toEqual([]);
    expect((await searchEverything(agencyDb(), asMessaging(cast.partner), "Brightpath")).companies).toEqual([]);
    expect((await searchEverything(agencyDb(), asMessaging(cast.coordinator), "Kestrel")).companies.map((row) => row.label)).toEqual(["Kestrel Logistics Ltd"]);
    const all = await searchEverything(fynixDb(), fynixMessaging(cast.fynixAdmin), "Ltd");
    expect(all.companies.map((row) => row.label).sort()).toEqual(["Brightpath Media Pvt Ltd", "Halden Foods Ltd", "Kestrel Logistics Ltd", "Northgate Leads Ltd", "Ridgeway Partner Ltd"]);
  });
});

describe("notices for the screens", () => {
  it("lists a person's own notices newest first, with a limit and an unread filter, and never another person's", async () => {
    await sent();
    await sent();
    const mine = await listNotices(clientDb(), asMessaging(cast.clientActor));
    expect(mine).toHaveLength(2);
    expect(mine.every((row) => row.userId === cast.clientActor.userId)).toBe(true);
    expect(mine[0]!.createdAt.getTime()).toBeGreaterThanOrEqual(mine[1]!.createdAt.getTime());
    expect(await listNotices(clientDb(), asMessaging(cast.clientActor), { limit: 1 })).toHaveLength(1);
    await markNoticeRead(clientDb(), asMessaging(cast.clientActor), mine[0]!.id);
    expect(await listNotices(clientDb(), asMessaging(cast.clientActor), { unreadOnly: true })).toHaveLength(1);
    expect(await listNotices(clientDb(), asMessaging(cast.otherClient))).toEqual([]);
  });

  it("keeps the time a notice was first read, and does nothing for a notice that is not the person's", async () => {
    await sent();
    const [mine] = await listNotices(clientDb(), asMessaging(cast.clientActor));
    const [colleague] = await listNotices(clientDb(), asMessaging(cast.clientColleague));
    if (mine === undefined || colleague === undefined) throw new Error("No notices");
    const first = new Date("2026-11-25T10:00:00Z");
    await markNoticeRead(clientDb(), asMessaging(cast.clientActor), mine.id, { now: () => first });
    await markNoticeRead(clientDb(), asMessaging(cast.clientActor), mine.id, { now: () => new Date("2026-11-25T11:00:00Z") });
    const [after] = await ownerDb().select({ readAt: notification.readAt }).from(notification).where(eq(notification.id, mine.id));
    expect(after?.readAt?.toISOString()).toBe(first.toISOString());
    await markNoticeRead(clientDb(), asMessaging(cast.clientActor), colleague.id);
    const [theirs] = await ownerDb().select({ readAt: notification.readAt }).from(notification).where(eq(notification.id, colleague.id));
    expect(theirs?.readAt).toBeNull();
  });

  it("marks every unread notice read for the person only, Fynix staff included", async () => {
    await sent();
    await markAllNoticesRead(clientDb(), asMessaging(cast.clientActor));
    expect(await countUnreadNotices(clientDb(), asMessaging(cast.clientActor))).toBe(0);
    expect(await countUnreadNotices(clientDb(), asMessaging(cast.clientColleague))).toBe(1);
    const staff: MessagingActor = { userId: cast.fynixStaff, orgKind: "fynix", role: "member" };
    expect(await listNotices(fynixDb(), staff, { unreadOnly: true })).not.toHaveLength(0);
    await markAllNoticesRead(fynixDb(), staff);
    expect(await listNotices(fynixDb(), staff, { unreadOnly: true })).toEqual([]);
    expect(await countUnreadNotices(fynixDb(), fynixMessaging(cast.fynixAdmin))).toBe(1);
  });

  it("gives the shell both counts in one call", async () => {
    await sent();
    expect(await loadShellCounts(clientDb(), asMessaging(cast.clientActor))).toEqual({ notices: 1, messages: 0 });
  });
});
