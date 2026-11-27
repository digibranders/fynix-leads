import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agreement, aliasIdentity, campaign, campaignHost, campaignShare, hostHours, lead, leadHistory, leadReminder, meeting, member, user } from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import { getClientOverviewMetrics, getCoordinatorOverviewMetrics } from "@/server/domain/analytics";
import { readAgreementsPage } from "@/server/domain/campaign-overview";
import { listTenantCampaigns } from "@/server/domain/campaigns-tenant";
import { exportMeetingsCsv } from "@/server/domain/export-reads";
import { getLeadSubmissionOptions } from "@/server/domain/lead-reads";
import { decideLead, clientReviewLead, fynixOverturnRejection, listClientLeads, submitLead } from "@/server/domain/leads";
import { getLeadRecordForClient, getLeadRecordForFynix, getLeadRecordForSupply } from "@/server/domain/lead-record";
import { dueReminders, sweepLeads } from "@/server/domain/lead-sweep";
import { fynixRecordMeetingOutcome, listClientMeetings, recordMeetingOutcome } from "@/server/domain/meetings";
import { listRejections } from "@/server/domain/rejection-overview";
import { createPartnerAgency } from "@/server/domain/coordinators";
import { refusal } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

/**
 * The client-decides lead flow as the roles the app really runs (leads_client, leads_agency, leads_fynix, leads_auth): picking a time only books
 * the meeting, any side records the outcome (the first wins), the client accepts or rejects with a note, the 48 hour sweep accepts what nobody
 * answered, Fynix can overturn a rejection, and only an accepted lead (or a client no-show) counts. Every grant a step needs is exercised here.
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
  readonly coordinator: TenantActor;
  readonly partner: TenantActor;
  readonly otherAgency: TenantActor;
  readonly otherClient: TenantActor;
  readonly hostMemberId: string;
  readonly coordinatorAlias: string;
  readonly partnerAlias: string;
  readonly clientUserName: string;
  readonly clientUserEmail: string;
  readonly partnerName: string;
  readonly hostName: string;
}

let cast: Cast;
let counter = 0;
const clientDb = () => rig.dbs.roles.leads_client.db;
const agencyDb = () => rig.dbs.roles.leads_agency.db;
const ownerDb = () => rig.dbs.owner.db;

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
  const clientUser = person(target.client.id);
  const coordinatorUser = person(world.brightpath.id);
  const memberOf = async (userId: string): Promise<string> => {
    const [row] = await owner.select({ id: member.id }).from(member).where(eq(member.userId, userId));
    if (row === undefined) throw new Error("No member");
    return row.id;
  };
  await owner.update(member).set({ role: "manager" }).where(eq(member.userId, clientUser.id));
  await owner.update(member).set({ role: "manager" }).where(eq(member.userId, coordinatorUser.id));
  const clientMember = await memberOf(clientUser.id);
  const coordinatorMember = await memberOf(coordinatorUser.id);
  await owner.insert(campaignHost).values({ campaignId: target.id, clientOrgId: target.client.id, memberId: clientMember, jobTitle: "Chief Operating Officer" });
  await owner.update(member).set({ jobTitle: "Chief Operating Officer" }).where(eq(member.id, clientMember));
  for (const weekday of [1, 2, 3, 4, 5]) await owner.insert(hostHours).values({ memberId: clientMember, timeZone: "Europe/London", weekday, startMinute: 0, endMinute: 1440 });
  const admin = world.users[0];
  if (admin === undefined) throw new Error("No Fynix admin");
  await owner.insert(agreement).values({ campaignId: target.id, party: "client", version: 1, monthlyTarget: 12, totalTarget: 72, createdBy: await memberOf(admin.id) });
  await owner.insert(campaignShare).values({ campaignId: target.id, agencyOrgId: world.brightpath.id, monthlyShare: 5 }).onConflictDoNothing();
  const verifiedAlias = async (memberId: string, displayName: string, email: string): Promise<string> => {
    const [row] = await owner
      .insert(aliasIdentity)
      .values({ publicRef: `ALI-${displayName.length}M2K`.slice(0, 8).replace(/[^A-Z0-9-]/g, "7"), memberId, clientOrgId: target.client.id, displayName, jobTitle: "Business development", aliasEmail: email, verifiedAt: new Date(), status: "active" })
      .returning({ id: aliasIdentity.id });
    if (row === undefined) throw new Error("No alias");
    return row.id;
  };
  const coordinatorAlias = await verifiedAlias(coordinatorMember, "Lena Hartmann", "lena@brand.example");

  // A partner agency under Brightpath with one manager and a share, so a lead can come from an agency that is not the coordinator.
  const partnerName = "Ridgeway Partner Ltd";
  const partnerOrg = await createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: world.brightpath.id, name: partnerName });
  const [partnerUser] = await owner.insert(user).values({ email: "pia@ridgeway.example", name: "Pia Ridgeway" }).returning({ id: user.id });
  if (partnerUser === undefined) throw new Error("No partner user");
  const [partnerMember] = await owner.insert(member).values({ userId: partnerUser.id, orgId: partnerOrg.id, orgKind: "agency", role: "manager", displayName: "Pia Ridgeway" }).returning({ id: member.id });
  if (partnerMember === undefined) throw new Error("No partner member");
  await owner.insert(campaignShare).values({ campaignId: target.id, agencyOrgId: partnerOrg.id, monthlyShare: 3 });
  const [partnerAliasRow] = await owner
    .insert(aliasIdentity)
    .values({ publicRef: "ALI-9R4T", memberId: partnerMember.id, clientOrgId: target.client.id, displayName: "Piet Ridge", jobTitle: "Partnerships", aliasEmail: "piet@ridgeway-brand.example", verifiedAt: new Date(), status: "active" })
    .returning({ id: aliasIdentity.id });
  if (partnerAliasRow === undefined) throw new Error("No partner alias");

  const otherAgencyUser = person(world.northgate.id);
  const otherClientUser = person(world.halden.id);
  await owner.update(member).set({ role: "manager" }).where(eq(member.userId, otherAgencyUser.id));
  await owner.update(member).set({ role: "manager" }).where(eq(member.userId, otherClientUser.id));
  cast = {
    campaignId: target.id,
    clientActor: { userId: clientUser.id, orgId: target.client.id, orgKind: "client", role: "manager" },
    coordinator: { userId: coordinatorUser.id, orgId: world.brightpath.id, orgKind: "agency", role: "manager" },
    partner: { userId: partnerUser.id, orgId: partnerOrg.id, orgKind: "agency", role: "manager" },
    otherAgency: { userId: otherAgencyUser.id, orgId: world.northgate.id, orgKind: "agency", role: "manager" },
    otherClient: { userId: otherClientUser.id, orgId: world.halden.id, orgKind: "client", role: "manager" },
    hostMemberId: clientMember,
    coordinatorAlias,
    partnerAlias: partnerAliasRow.id,
    clientUserName: clientUser.name,
    clientUserEmail: clientUser.email,
    partnerName,
    hostName: clientUser.name,
  };
});

function nextWeekdayAt(hour: number, daysAhead: number): string {
  const date = new Date(Date.now() + daysAhead * 86_400_000);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

interface Booked {
  readonly leadId: string;
  readonly publicRef: string;
  readonly meetingId: string;
  readonly time: string;
}

/** An agency submits a lead (its own alias) and the client picks the first time. Returns the lead and its meeting. */
async function booked(from: "coordinator" | "partner" = "coordinator", time = nextWeekdayAt(10, 3)): Promise<Booked> {
  counter += 1;
  const sender = from === "coordinator" ? cast.coordinator : cast.partner;
  await submitLead(agencyDb(), rig.deps(), sender, {
    campaignId: cast.campaignId,
    aliasIdentityId: from === "coordinator" ? cast.coordinatorAlias : cast.partnerAlias,
    hostMemberId: cast.hostMemberId,
    prospectName: `Marta Lindqvist ${counter}`,
    prospectTitle: "Head of Logistics",
    prospectCompany: `Nordvik Cold Chain ${counter}`,
    prospectDomain: `nordvik${counter}.example`,
    prospectLinkedinUrl: `https://www.linkedin.com/in/marta${counter}`,
    prospectEmail: `marta${counter}@nordvik${counter}.example`,
    bantBudget: "Confirmed",
    bantAuthority: "Signs off",
    bantNeed: "Replacing a manual process",
    bantTimeline: "One quarter",
    proposedTimes: [time],
  });
  const leads = await listClientLeads(clientDb(), cast.clientActor);
  const created = leads.find((row) => row.prospectEmail === `marta${counter}@nordvik${counter}.example`);
  if (created === undefined) throw new Error("No lead");
  await clientReviewLead(clientDb(), rig.deps(), cast.clientActor, { leadId: created.id, action: "accept", selectedMeetingTime: time });
  const meetings = await listClientMeetings(clientDb(), cast.clientActor);
  const booking = meetings.find((row) => row.leadId === created.id);
  if (booking === undefined) throw new Error("No meeting");
  return { leadId: created.id, publicRef: created.publicRef, meetingId: booking.id, time };
}

const row = async (leadId: string) => {
  const [found] = await ownerDb().select().from(lead).where(eq(lead.id, leadId));
  if (found === undefined) throw new Error("No lead row");
  return found;
};
/** Drizzle wraps the driver error: the refusal is in the cause chain. Fails when the statement is allowed. */
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
const clientCount = async (): Promise<number> => (await getClientOverviewMetrics(clientDb(), cast.clientActor)).deliveredCount;

describe("choosing a client team member for a lead", () => {
  const input = (hostMemberId: string, tag: string) => ({
    campaignId: cast.campaignId,
    aliasIdentityId: cast.coordinatorAlias,
    hostMemberId,
    prospectName: `Team Choice ${tag}`,
    prospectTitle: "Head of Logistics",
    prospectCompany: `Teamchoice ${tag} Ltd`,
    prospectDomain: `teamchoice${tag}.example`,
    prospectLinkedinUrl: `https://www.linkedin.com/in/teamchoice${tag}`,
    prospectEmail: `lead@teamchoice${tag}.example`,
    bantBudget: "Confirmed",
    bantAuthority: "Signs off",
    bantNeed: "Replacing a manual process",
    bantTimeline: "One quarter",
    proposedTimes: [nextWeekdayAt(10, 3)],
  });

  it("accepts any active person of the campaign's client, though nobody ever made them a host", async () => {
    const [colleagueUser] = await ownerDb().insert(user).values({ email: "colleague@kestrel-team.example", name: "Colleague Teammate" }).returning({ id: user.id });
    if (colleagueUser === undefined) throw new Error("No colleague user");
    const [colleague] = await ownerDb().insert(member).values({ userId: colleagueUser.id, orgId: cast.clientActor.orgId, orgKind: "client", role: "member", displayName: "Colleague Teammate" }).returning({ id: member.id });
    if (colleague === undefined) throw new Error("No colleague member");
    await submitLead(agencyDb(), rig.deps(), cast.coordinator, input(colleague.id, "A"));
    const [stored] = await ownerDb().select({ hostMemberId: lead.hostMemberId, stage: lead.stage }).from(lead).where(eq(lead.prospectEmail, "lead@teamchoicea.example"));
    expect(stored).toEqual({ hostMemberId: colleague.id, stage: "awaiting_client" });
  });

  it("refuses a person of another client, and a suspended person of this one", async () => {
    const otherClientMember = (await ownerDb().select({ id: member.id }).from(member).where(eq(member.userId, cast.otherClient.userId)))[0];
    if (otherClientMember === undefined) throw new Error("No other client member");
    expect((await refusal(submitLead(agencyDb(), rig.deps(), cast.coordinator, input(otherClientMember.id, "B")))).code).toBe("not-found");
    await ownerDb().update(member).set({ status: "suspended" }).where(eq(member.id, cast.hostMemberId));
    expect((await refusal(submitLead(agencyDb(), rig.deps(), cast.coordinator, input(cast.hostMemberId, "C")))).code).toBe("not-found");
  });
});

describe("picking a time", () => {
  it("only books the meeting: the lead is scheduled, not accepted, and counts nothing", async () => {
    const one = await booked();
    const after = await row(one.leadId);
    expect(after.stage).toBe("scheduled");
    expect(after.deliveredAt).toBeNull();
    expect(after.decisionSource).toBeNull();
    expect(await clientCount()).toBe(0);
    expect((await ownerDb().select().from(meeting).where(eq(meeting.leadId, one.leadId)))[0]?.outcome).toBe("scheduled");
  });
});

describe("rejecting before the meeting", () => {
  it("is allowed while a time is booked, needs a note, cancels the meeting and closes the lead at zero", async () => {
    const one = await booked();
    const review = (declineReason: string) => clientReviewLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, action: "decline", declineReason });
    expect((await refusal(review("no"))).code).toBe("invalid-input");
    expect((await refusal(review("   "))).code).toBe("invalid-input");

    await review("Not in our target market this year");
    const after = await row(one.leadId);
    expect(after).toMatchObject({ stage: "declined", declineReason: "Not in our target market this year", decisionNote: "Not in our target market this year", decisionSource: "client", decisionByUserId: cast.clientActor.userId });
    expect(after.closedAt).toBeInstanceOf(Date);
    expect(after.decisionAt).toBeInstanceOf(Date);
    expect((await ownerDb().select().from(meeting).where(eq(meeting.leadId, one.leadId)))[0]?.outcome).toBe("cancelled");
    expect(await clientCount()).toBe(0);
    const history = await ownerDb().select().from(leadHistory).where(eq(leadHistory.leadId, one.leadId));
    expect(history.find((entry) => entry.action === "lead.decline")).toMatchObject({ fromStage: "scheduled", toStage: "declined", note: "Not in our target market this year", actorRole: "client" });
  });

  it("is refused once the meeting has been held, and for another client", async () => {
    const one = await booked();
    expect((await refusal(clientReviewLead(clientDb(), rig.deps(), cast.otherClient, { leadId: one.leadId, action: "decline", declineReason: "Not for us at all" }))).code).toBe("not-found");
    await recordMeetingOutcome(clientDb(), rig.deps(), cast.clientActor, { meetingId: one.meetingId, outcome: "held" });
    expect((await refusal(clientReviewLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, action: "decline", declineReason: "Not for us at all" }))).code).toBe("invalid-lead-stage");
  });
});

describe("recording the outcome", () => {
  it.each([
    ["the client", "client"],
    ["the coordinator", "coordinator"],
    ["the agency that sent the lead", "agency"],
  ] as const)("is done by %s, who is recorded as a side", async (_name, side) => {
    const one = await booked(side === "agency" ? "partner" : "coordinator");
    const actor = side === "client" ? cast.clientActor : side === "agency" ? cast.partner : cast.coordinator;
    const db = side === "client" ? clientDb() : agencyDb();
    rig.clock.now = new Date("2026-12-01T12:00:00Z");
    await recordMeetingOutcome(db, rig.deps(), actor, { meetingId: one.meetingId, outcome: "held", notes: "Good call, they asked for a proposal." });

    const [booking] = await ownerDb().select().from(meeting).where(eq(meeting.id, one.meetingId));
    expect(booking).toMatchObject({ outcome: "held", recordedByRole: side, recordedByUserId: actor.userId, notes: "Good call, they asked for a proposal." });
    expect(booking?.recordedAt?.toISOString()).toBe("2026-12-01T12:00:00.000Z");
    const after = await row(one.leadId);
    expect(after.stage).toBe("awaiting_decision");
    expect(after.outcomeRecordedAt?.toISOString()).toBe("2026-12-01T12:00:00.000Z");
    expect(after.deliveredAt).toBeNull();
    expect(await clientCount()).toBe(0);
  });

  it("is done by Fynix, admin or staff, with an audit row", async () => {
    for (const [actor, who] of [[rig.actor, "admin"], [rig.staffActor, "staff"]] as const) {
      const one = await booked();
      await fynixRecordMeetingOutcome(rig.dbs.roles.leads_fynix.db, rig.deps(), actor, { meetingId: one.meetingId, outcome: "held" });
      const [booking] = await ownerDb().select().from(meeting).where(eq(meeting.id, one.meetingId));
      expect(booking, who).toMatchObject({ outcome: "held", recordedByRole: "fynix", recordedByUserId: actor.userId });
      expect((await row(one.leadId)).stage, who).toBe("awaiting_decision");
    }
  });

  it("lets the first one set it and refuses the second, whichever side", async () => {
    const one = await booked();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, outcome: "prospect_no_show" });
    expect((await refusal(recordMeetingOutcome(clientDb(), rig.deps(), cast.clientActor, { meetingId: one.meetingId, outcome: "held" }))).code).toBe("outcome-already-recorded");
    expect((await refusal(fynixRecordMeetingOutcome(rig.dbs.roles.leads_fynix.db, rig.deps(), rig.actor, { meetingId: one.meetingId, outcome: "held" }))).code).toBe("outcome-already-recorded");
    expect((await ownerDb().select().from(meeting).where(eq(meeting.id, one.meetingId)))[0]).toMatchObject({ outcome: "prospect_no_show", recordedByRole: "coordinator" });
  });

  it("is refused for an agency that does not hold the lead, another client, and a lead that is not scheduled", async () => {
    const one = await booked("partner");
    const input = { meetingId: one.meetingId, outcome: "held" } as const;
    expect((await refusal(recordMeetingOutcome(agencyDb(), rig.deps(), cast.otherAgency, input))).code).toBe("not-found");
    expect((await refusal(recordMeetingOutcome(clientDb(), rig.deps(), cast.otherClient, input))).code).toBe("not-found");
    await clientReviewLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, action: "decline", declineReason: "Changed our minds" });
    // The meeting was cancelled with the rejection, so no outcome can follow it.
    expect((await refusal(recordMeetingOutcome(clientDb(), rig.deps(), cast.clientActor, input))).code).toBe("outcome-already-recorded");
  });

  it("counts a client no-show as one at once, and a prospect no-show as zero with the lead closed", async () => {
    const noShow = await booked();
    const prospect = await booked();
    rig.clock.now = new Date("2026-12-02T09:00:00Z");
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: noShow.meetingId, outcome: "client_no_show" });
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: prospect.meetingId, outcome: "prospect_no_show" });

    const counted = await row(noShow.leadId);
    expect(counted.stage).toBe("client_no_show");
    expect(counted.deliveredAt?.toISOString()).toBe("2026-12-02T09:00:00.000Z");
    const closed = await row(prospect.leadId);
    expect(closed.stage).toBe("prospect_no_show");
    expect(closed.closedAt?.toISOString()).toBe("2026-12-02T09:00:00.000Z");
    expect(closed.deliveredAt).toBeNull();
    expect(await clientCount()).toBe(1);
    expect((await getCoordinatorOverviewMetrics(agencyDb(), cast.coordinator)).deliveredCount).toBe(1);
  });
});

describe("the client's decision", () => {
  async function heldLead() {
    const one = await booked();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, outcome: "held" });
    return one;
  }

  it("accepts with a note: accepted, counts one, with who and when", async () => {
    const one = await heldLead();
    rig.clock.now = new Date("2026-12-03T10:00:00Z");
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, decision: "accept", note: "Qualified, we are booking a demo." });
    expect(await row(one.leadId)).toMatchObject({ stage: "accepted", decisionNote: "Qualified, we are booking a demo.", decisionSource: "client", decisionByUserId: cast.clientActor.userId });
    expect((await row(one.leadId)).deliveredAt?.toISOString()).toBe("2026-12-03T10:00:00.000Z");
    expect(await clientCount()).toBe(1);
    const history = (await ownerDb().select().from(leadHistory).where(eq(leadHistory.leadId, one.leadId))).find((entry) => entry.action === "lead.decide_accept");
    expect(history).toMatchObject({ fromStage: "awaiting_decision", toStage: "accepted", note: "Qualified, we are booking a demo.", actorRole: "client" });
  });

  it("rejects with a note: rejected, counts zero, the lead closes", async () => {
    const one = await heldLead();
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, decision: "reject", note: "Not a decision maker, no budget." });
    const after = await row(one.leadId);
    expect(after).toMatchObject({ stage: "rejected", decisionNote: "Not a decision maker, no budget.", decisionSource: "client" });
    expect(after.closedAt).toBeInstanceOf(Date);
    expect(after.deliveredAt).toBeNull();
    expect(await clientCount()).toBe(0);
  });

  it("needs a note both ways, answers once, and only for a lead awaiting a decision, as the lead's own client", async () => {
    const one = await heldLead();
    for (const decision of ["accept", "reject"] as const) {
      expect((await refusal(decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, decision, note: "ok" }))).code).toBe("invalid-input");
      expect((await refusal(decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, decision, note: "x".repeat(1001) }))).code).toBe("invalid-input");
    }
    expect((await refusal(decideLead(clientDb(), rig.deps(), cast.otherClient, { leadId: one.leadId, decision: "accept", note: "Looks good to me" }))).code).toBe("not-found");
    expect((await refusal(decideLead(agencyDb(), rig.deps(), cast.coordinator, { leadId: one.leadId, decision: "accept", note: "Looks good to me" }))).code).toBe("not-authorised");
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, decision: "accept", note: "Looks good to me" });
    expect((await refusal(decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, decision: "reject", note: "I changed my mind" }))).code).toBe("invalid-lead-stage");

    const scheduled = await booked();
    expect((await refusal(decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: scheduled.leadId, decision: "accept", note: "Before the meeting" }))).code).toBe("invalid-lead-stage");
  });
});

describe("the 48 hour sweep and the reminders", () => {
  const outcomeAt = new Date("2026-12-01T12:00:00Z");
  const hoursAfter = (hours: number): Date => new Date(outcomeAt.getTime() + hours * 3_600_000);

  async function awaiting() {
    const one = await booked();
    rig.clock.now = outcomeAt;
    await recordMeetingOutcome(clientDb(), rig.deps(), cast.clientActor, { meetingId: one.meetingId, outcome: "held" });
    return one;
  }

  it("writes the three reminders when the outcome is recorded as held", async () => {
    const one = await awaiting();
    const rows = await ownerDb().select().from(leadReminder).where(eq(leadReminder.leadId, one.leadId));
    expect(rows.map((entry) => [entry.kind, entry.dueAt.toISOString(), entry.sentAt]).sort()).toEqual([
      ["12h", "2026-12-02T00:00:00.000Z", null],
      ["24h", "2026-12-02T12:00:00.000Z", null],
      ["36h", "2026-12-03T00:00:00.000Z", null],
    ]);
    const noShow = await booked();
    await recordMeetingOutcome(clientDb(), rig.deps(), cast.clientActor, { meetingId: noShow.meetingId, outcome: "prospect_no_show" });
    expect(await ownerDb().select().from(leadReminder).where(eq(leadReminder.leadId, noShow.leadId))).toEqual([]);
  });

  it("lists the reminders that are due, with the hours left, until the client answers", async () => {
    const one = await awaiting();
    const deps = rig.deps();
    expect(await dueReminders(deps, hoursAfter(11))).toEqual([]);
    expect((await dueReminders(deps, hoursAfter(13))).map((entry) => [entry.kind, entry.leadRef, entry.hoursLeft])).toEqual([["12h", one.publicRef, 35]]);
    expect((await dueReminders(deps, hoursAfter(37))).map((entry) => [entry.kind, entry.hoursLeft])).toEqual([["12h", 11], ["24h", 11], ["36h", 11]]);
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, decision: "reject", note: "Not what we need now" });
    expect(await dueReminders(deps, hoursAfter(37))).toEqual([]);
  });

  it("accepts at 48 hours with no answer, as automatic, once, with a system history row", async () => {
    const one = await awaiting();
    const deps = rig.deps();
    expect(await sweepLeads(deps, hoursAfter(47.9))).toEqual([]);
    expect((await row(one.leadId)).stage).toBe("awaiting_decision");

    const swept = await sweepLeads(deps, hoursAfter(48));
    expect(swept).toEqual([{ id: one.leadId, publicRef: one.publicRef }]);
    const after = await row(one.leadId);
    expect(after).toMatchObject({ stage: "accepted", decisionSource: "auto", decisionNote: "Accepted automatically after 48 hours with no answer", decisionByUserId: null });
    expect(after.deliveredAt?.toISOString()).toBe(hoursAfter(48).toISOString());
    expect(await clientCount()).toBe(1);
    const entry = (await ownerDb().select().from(leadHistory).where(eq(leadHistory.leadId, one.leadId))).find((item) => item.action === "lead.auto_accept");
    expect(entry).toMatchObject({ actorRole: "system", actorUserId: null, fromStage: "awaiting_decision", toStage: "accepted", note: "Accepted automatically after 48 hours with no answer" });

    // Idempotent: a second run, and a much later one, change nothing.
    expect(await sweepLeads(deps, hoursAfter(49))).toEqual([]);
    expect(await sweepLeads(deps, hoursAfter(500))).toEqual([]);
    expect((await ownerDb().select().from(leadHistory).where(eq(leadHistory.leadId, one.leadId))).filter((item) => item.action === "lead.auto_accept")).toHaveLength(1);
  });

  it("leaves a lead the client answered, a lead before its meeting and a lead with no answer yet alone", async () => {
    const answered = await awaiting();
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: answered.leadId, decision: "reject", note: "Not a fit for us" });
    const early = await booked();
    expect(await sweepLeads(rig.deps(), hoursAfter(1000))).toEqual([]);
    expect((await row(answered.leadId)).stage).toBe("rejected");
    expect((await row(early.leadId)).stage).toBe("scheduled");
  });
});

describe("Fynix changes a rejection", () => {
  async function rejected() {
    const one = await booked();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, outcome: "held" });
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, decision: "reject", note: "The prospect was not senior enough." });
    return one;
  }

  it("lists every rejection with its note, client, campaign and agency, and takes the overturned ones off the list", async () => {
    const one = await rejected();
    const rows = await listRejections(rig.deps(), rig.staffActor);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ leadRef: one.publicRef, note: "The prospect was not senior enough.", rejectedByName: cast.clientUserName, agencyName: expect.any(String), clientName: expect.any(String), campaignName: expect.any(String) });

    await fynixOverturnRejection(rig.dbs.roles.leads_fynix.db, rig.deps(), rig.staffActor, { leadId: one.leadId, note: "Reviewed the call notes: the prospect signs off." });
    expect(await listRejections(rig.deps(), rig.staffActor)).toEqual([]);
  });

  it("makes it accepted with Fynix's own note, counts one, and keeps the client's note in the history", async () => {
    const one = await rejected();
    rig.clock.now = new Date("2026-12-05T08:00:00Z");
    await fynixOverturnRejection(rig.dbs.roles.leads_fynix.db, rig.deps(), rig.actor, { leadId: one.leadId, note: "Reviewed the call notes: the prospect signs off." });
    const after = await row(one.leadId);
    expect(after).toMatchObject({ stage: "accepted", decisionSource: "fynix", decisionNote: "Reviewed the call notes: the prospect signs off.", decisionByUserId: rig.actor.userId, closedAt: null });
    expect(after.deliveredAt?.toISOString()).toBe("2026-12-05T08:00:00.000Z");
    expect(await clientCount()).toBe(1);
    const notes = (await ownerDb().select().from(leadHistory).where(eq(leadHistory.leadId, one.leadId))).map((entry) => [entry.action, entry.note]);
    expect(notes).toEqual(expect.arrayContaining([["lead.decide_reject", "The prospect was not senior enough."], ["lead.overturn_rejection", "Reviewed the call notes: the prospect signs off."]]));
  });

  it("needs a note, a rejected lead, and a Fynix member", async () => {
    const one = await rejected();
    const fynix = rig.dbs.roles.leads_fynix.db;
    expect((await refusal(fynixOverturnRejection(fynix, rig.deps(), rig.actor, { leadId: one.leadId, note: "no" }))).code).toBe("invalid-input");
    expect((await refusal(fynixOverturnRejection(fynix, rig.deps(), { userId: cast.clientActor.userId }, { leadId: one.leadId, note: "I am not Fynix, honestly" }))).code).toBe("not-authorised");
    const open = await booked();
    expect((await refusal(fynixOverturnRejection(fynix, rig.deps(), rig.actor, { leadId: open.leadId, note: "Not rejected at all" }))).code).toBe("invalid-lead-stage");
    // A rejection before the meeting never counted, so there is nothing to change.
    const early = await booked();
    await clientReviewLead(clientDb(), rig.deps(), cast.clientActor, { leadId: early.leadId, action: "decline", declineReason: "Not for us at all" });
    expect((await refusal(fynixOverturnRejection(fynix, rig.deps(), rig.actor, { leadId: early.leadId, note: "Change it please" }))).code).toBe("invalid-lead-stage");
  });
});

describe("what each portal reads of a lead", () => {
  async function decided() {
    const one = await booked("partner");
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.partner, { meetingId: one.meetingId, outcome: "held" });
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, decision: "accept", note: "Strong fit, the demo is booked." });
    return one;
  }

  it("gives the client the prospect, the alias that wrote, its own host and the note, and nothing of the supply side", async () => {
    const one = await decided();
    const record = await getLeadRecordForClient(clientDb(), cast.clientActor, one.publicRef);
    expect(record).toMatchObject({
      stage: "accepted",
      counted: true,
      prospect: { company: expect.stringContaining("Nordvik Cold Chain"), email: expect.stringContaining("@nordvik") },
      bant: { need: "Replacing a manual process" },
      alias: { displayName: "Piet Ridge", jobTitle: "Partnerships" },
      host: { name: cast.hostName, jobTitle: "Chief Operating Officer" },
      decision: { note: "Strong fit, the demo is booked.", source: "client", byName: cast.clientUserName },
      meeting: { outcome: "held", recordedByRole: "agency" },
    });
    expect(record.history.map((entry) => entry.action)).toEqual(expect.arrayContaining(["lead.submit", "lead.accept", "meeting.outcome", "lead.decide_accept"]));
    expect(record.history.find((entry) => entry.action === "lead.decide_accept")?.note).toBe("Strong fit, the demo is booked.");
    const text = JSON.stringify(record);
    for (const forbidden of [cast.partnerName, "Ridgeway", "Brightpath", "piet@ridgeway-brand.example", "Pia Ridgeway", cast.partner.orgId, cast.partner.userId, cast.coordinator.orgId]) expect(text, forbidden).not.toContain(forbidden);
    expect(await refusal(getLeadRecordForClient(clientDb(), cast.otherClient, one.publicRef))).toMatchObject({ code: "not-found" });
    expect(await refusal(getLeadRecordForClient(agencyDb(), cast.coordinator, one.publicRef))).toMatchObject({ code: "not-authorised" });
  });

  it("gives the coordinator and the sending agency the note as from the client, without the person, and nothing about the host", async () => {
    const one = await decided();
    const forCoordinator = await getLeadRecordForSupply(agencyDb(), cast.coordinator, one.publicRef);
    const forPartner = await getLeadRecordForSupply(agencyDb(), cast.partner, one.publicRef);
    expect(forCoordinator).toMatchObject({ stage: "accepted", decision: { note: "Strong fit, the demo is booked.", source: "client", byName: null }, host: { name: null, jobTitle: null }, source: { own: false, name: cast.partnerName } });
    expect(forPartner).toMatchObject({ decision: { source: "client", byName: null }, source: { own: true }, alias: { displayName: "Piet Ridge" } });
    // The coordinator may not read a partner agency's alias.
    expect(forCoordinator.alias).toBeNull();
    for (const record of [forCoordinator, forPartner]) {
      const text = JSON.stringify(record);
      for (const forbidden of [cast.clientUserName, cast.clientUserEmail, cast.clientActor.userId, cast.hostMemberId, "Chief Operating Officer", "decisionBy"]) expect(text, forbidden).not.toContain(forbidden);
      expect(record.history.find((entry) => entry.action === "lead.decide_accept")).toMatchObject({ by: "client", actorName: null, note: "Strong fit, the demo is booked." });
    }
    expect(await refusal(getLeadRecordForSupply(agencyDb(), cast.otherAgency, one.publicRef))).toMatchObject({ code: "not-found" });
    // A partner agency does not read the lead of the coordinator.
    const coordinatorLead = await booked("coordinator");
    expect(await refusal(getLeadRecordForSupply(agencyDb(), cast.partner, coordinatorLead.publicRef))).toMatchObject({ code: "not-found" });
  });

  it("gives Fynix everything, with names, the counting month in the campaign's zone and the whole history", async () => {
    const one = await decided();
    await ownerDb().update(campaign).set({ timeZone: "Asia/Kolkata" });
    await ownerDb().update(lead).set({ scheduledMeetingTime: new Date("2026-10-31T20:00:00Z") }).where(eq(lead.id, one.leadId));
    const record = await getLeadRecordForFynix(rig.deps(), rig.staffActor, one.publicRef);
    expect(record).toMatchObject({
      clientName: expect.any(String),
      source: { name: cast.partnerName },
      aliasEmail: "piet@ridgeway-brand.example",
      host: { name: cast.hostName },
      decision: { source: "client", byName: cast.clientUserName },
      counted: true,
      countedMonth: "2026-11",
      timeZone: "Asia/Kolkata",
    });
    expect(record.history.find((entry) => entry.action === "lead.decide_accept")).toMatchObject({ by: "client", actorName: cast.clientUserName });
  });

  it("denies the roles the columns they must not have, straight into the tables", async () => {
    const one = await decided();
    const asAgency = <T>(work: Parameters<typeof withTenantScope<T>>[2]) => withTenantScope(agencyDb(), { orgId: cast.coordinator.orgId, userId: cast.coordinator.userId }, work);
    const asClient = <T>(work: Parameters<typeof withTenantScope<T>>[2]) => withTenantScope(clientDb(), { orgId: cast.clientActor.orgId, userId: cast.clientActor.userId }, work);
    const { sql } = await import("drizzle-orm");
    // The agency side never reads the person who decided, and never writes a decision.
    await denied(asAgency((tx) => tx.execute(sql`select decision_by_user_id from lead`)), /permission denied for table lead/);
    await denied(asAgency((tx) => tx.execute(sql`update lead set decision_note = 'forged', decision_source = 'client'`)), /permission denied for table lead/);
    await denied(asAgency((tx) => tx.execute(sql`select recorded_by_user_id from meeting`)), /permission denied for table meeting/);
    await denied(asAgency((tx) => tx.execute(sql`select * from lead_reminder`)), /permission denied for table lead_reminder/);
    await denied(asClient((tx) => tx.execute(sql`select * from lead_reminder`)), /permission denied for table lead_reminder/);
    await denied(asClient((tx) => tx.execute(sql`select source_org_id from lead`)), /permission denied for table lead/);
    await denied(asClient((tx) => tx.execute(sql`select display_name from alias_identity`)), /permission denied for table alias_identity/);
    await denied(asClient((tx) => tx.execute(sql`select * from public.app_sweep_leads(now())`)), /permission denied for function app_sweep_leads/);
    await denied(asAgency((tx) => tx.execute(sql`select * from public.app_due_lead_reminders(now())`)), /permission denied for function app_due_lead_reminders/);
    // The client may read the alias of its own leads only, through the function.
    const own = await asClient((tx) => tx.execute<{ display_name: string }>(sql`select display_name from public.app_lead_alias_name(${one.leadId}::uuid)`));
    expect(own.rows).toEqual([{ display_name: "Piet Ridge" }]);
    const foreign = await withTenantScope(clientDb(), { orgId: cast.otherClient.orgId, userId: cast.otherClient.userId }, (tx) => tx.execute(sql`select display_name from public.app_lead_alias_name(${one.leadId}::uuid)`));
    expect(foreign.rows).toEqual([]);
  });
});

describe("the month a lead counts in", () => {
  it("reads the month of the meeting in the campaign's time zone, per agency, and only for a counted lead", async () => {
    const accepted = await booked("partner");
    const rejectedLead = await booked("partner");
    const open = await booked("coordinator");
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.partner, { meetingId: accepted.meetingId, outcome: "held" });
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.partner, { meetingId: rejectedLead.meetingId, outcome: "held" });
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: accepted.leadId, decision: "accept", note: "Accepted for the month" });
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: rejectedLead.leadId, decision: "reject", note: "Rejected, no budget" });
    await ownerDb().update(campaign).set({ timeZone: "Asia/Kolkata" });
    // 20:00 UTC on 31 October is 1:30 am on 1 November in Kolkata.
    for (const id of [accepted.leadId, rejectedLead.leadId, open.leadId]) await ownerDb().update(lead).set({ scheduledMeetingTime: new Date("2026-10-31T20:00:00Z") }).where(eq(lead.id, id));

    const page = await readAgreementsPage(rig.deps(), rig.actor, cast.campaignId);
    const byAgency = new Map(page.shares.map((share) => [share.agencyName, share.countedByMonth]));
    expect(byAgency.get(cast.partnerName)).toEqual({ "2026-11": 1 });
    expect(byAgency.get("Brightpath Outreach") ?? {}).toEqual({});
    await ownerDb().update(campaign).set({ timeZone: "America/Los_Angeles" });
    expect((await readAgreementsPage(rig.deps(), rig.actor, cast.campaignId)).shares.find((share) => share.agencyName === cast.partnerName)?.countedByMonth).toEqual({ "2026-10": 1 });
  });
});

describe("the client's name for the supply side", () => {
  it("shows the coordinator and the partner agency the client's name on the campaign, in the submission options and in the meetings file, and the client no extra column", async () => {
    const world = rig.world();
    const clientName = world.campaigns[0]?.client.name ?? "";
    await booked("coordinator");
    await booked("partner");
    for (const actor of [cast.coordinator, cast.partner]) {
      const options = await getLeadSubmissionOptions(agencyDb(), actor);
      expect(options.campaigns.find((row) => row.id === cast.campaignId)?.clientName).toBe(clientName);
      const campaigns = await listTenantCampaigns(agencyDb(), actor, actor === cast.coordinator ? "coordinator" : "agency");
      expect(campaigns.find((row) => row.id === cast.campaignId)?.clientName).toBe(clientName);
      const csv = await exportMeetingsCsv(agencyDb(), actor);
      expect(csv.split("\r\n")[0]).toContain("Campaign,Client,Start");
      expect(csv).toContain(clientName);
    }
    expect((await getLeadSubmissionOptions(agencyDb(), cast.coordinator)).aliases.find((row) => row.id === cast.coordinatorAlias)?.clientName).toBe(clientName);
    expect((await exportMeetingsCsv(clientDb(), cast.clientActor)).split("\r\n")[0]).not.toContain("Client,");
  });

  it("refuses a lead under an alias that never picked its client until the client is picked, then accepts it", async () => {
    await ownerDb().execute(sql`update alias_identity set client_org_id = null where id = ${cast.coordinatorAlias}`);
    const options = await getLeadSubmissionOptions(agencyDb(), cast.coordinator);
    expect(options.aliases.find((row) => row.id === cast.coordinatorAlias)).toMatchObject({ clientOrgId: null, clientName: "" });
    await expect(booked("coordinator")).rejects.toThrow(/no client yet/);
    await ownerDb().execute(sql`update alias_identity set client_org_id = (select client_org_id from campaign where id = ${cast.campaignId}) where id = ${cast.coordinatorAlias}`);
    await expect(booked("coordinator")).resolves.toMatchObject({ publicRef: expect.stringMatching(/^LD-/) });
  });
});
