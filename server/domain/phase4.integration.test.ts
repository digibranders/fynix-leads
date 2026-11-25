import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agreement, aliasIdentity, auditLog, campaign, campaignHost, campaignShare, exclusionEntry, hostBlock, hostHours, lead, leadHistory, leadReminder, meeting, meetingReschedule, member, rejectionReview, user } from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import { getClientOverviewMetrics } from "@/server/domain/analytics";
import { agencyRejectionReviewColumns, agencyRescheduleColumns, clientRescheduleColumns, columnNames } from "@/server/db/columns";
import { contestOutcome, fynixDecideContest, listContests } from "@/server/domain/contests";
import { addExclusionByClient, listClientExclusions, removeExclusionByClient } from "@/server/domain/exclusions";
import { exportLeadsCsv, exportMeetingsCsv } from "@/server/domain/export-reads";
import { fynixAnswerForClient, fynixApproveOverShare, fynixCorrectLead, fynixMarkLost } from "@/server/domain/fynix-lead-actions";
import { checkProposedTimes, getHostAvailability } from "@/server/domain/host-availability";
import { discardDraft, saveDraft, submitDraft, updateDraft, withdrawLead } from "@/server/domain/lead-drafts";
import { clientReviewLead, decideLead, fynixOverturnRejection, getLeadSubmissionOptions, getOwnDraft, listAgencyDrafts, listAgencyLeads, listClientLeads, listFynixLeads, submitLead } from "@/server/domain/leads";
import { getLeadRecordForClient, getLeadRecordForFynix, getLeadRecordForSupply } from "@/server/domain/lead-record";
import { sweepLeads } from "@/server/domain/lead-sweep";
import { fynixRecordMeetingOutcome, listAgencyMeetings, listClientMeetings, listFynixMeetings, recordMeetingOutcome } from "@/server/domain/meetings";
import { readFynixPipelineHealth } from "@/server/domain/pipeline-health";
import { markRejectionReviewed, listRejectionReviews, requestRejectionReview } from "@/server/domain/rejection-reviews";
import { listRejections } from "@/server/domain/rejection-overview";
import { createPartnerAgency } from "@/server/domain/suppliers";
import { refusal } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";
import { pickPostponement, proposePostponement, listReschedules } from "@/server/domain/postponement";

/**
 * Phase 4, the rest of the lead flow, as the roles the app really runs (leads_client, leads_agency, leads_fynix, leads_auth): drafts only their own
 * organisation reads, withdrawing, postponing, contesting an outcome, a review of a rejection, Fynix acting on a lead, the host's hours, exports and the
 * client's exclusion list. The cast and the helpers are those of lead-flow.integration.test.ts.
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
  const partnerOrg = await createPartnerAgency(rig.deps(), rig.actor, { supplierId: world.brightpath.id, name: partnerName });
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

const atMs = (start: Date, hours: number) => new Date(start.getTime() + hours * 3_600_000);
const asTenant = <T>(db: ReturnType<typeof clientDb>, actor: TenantActor, work: Parameters<typeof withTenantScope<T>>[2]) => withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, work);
const audits = async (action: string) => (await ownerDb().select().from(auditLog)).filter((entry) => entry.action === action);
const history = async (leadId: string) => (await ownerDb().select().from(leadHistory).where(eq(leadHistory.leadId, leadId))).map((entry) => entry.action);

let draftCounter = 0;
/** A complete lead as the form sends it, unique per call. */
function fullLead(overrides: Record<string, unknown> = {}) {
  draftCounter += 1;
  return {
    campaignId: cast.campaignId,
    aliasIdentityId: cast.coordinatorAlias,
    hostMemberId: cast.hostMemberId,
    prospectName: `Greta Voss ${draftCounter}`,
    prospectTitle: "Director of Operations",
    prospectCompany: `Voss Freight ${draftCounter}`,
    prospectDomain: `vossfreight${draftCounter}.example`,
    prospectLinkedinUrl: `https://www.linkedin.com/in/greta${draftCounter}`,
    prospectEmail: `greta${draftCounter}@vossfreight${draftCounter}.example`,
    bantBudget: "Confirmed",
    bantAuthority: "Signs off",
    bantNeed: "Replacing a manual process",
    bantTimeline: "One quarter",
    proposedTimes: [nextWeekdayAt(11, 4)],
    ...overrides,
  };
}

describe("drafts", () => {
  it("saves with only a campaign and a prospect name, and keeps what is not filled in as empty", async () => {
    const draft = await saveDraft(agencyDb(), rig.deps(), cast.coordinator, { campaignId: cast.campaignId, prospectName: "Greta Voss" });
    expect(draft).toMatchObject({ stage: "draft", released: false, prospectName: "Greta Voss", prospectEmail: "", prospectTitle: "", bantNeed: "", aliasIdentityId: null, hostMemberId: null, sourceOrgId: cast.coordinator.orgId });
    expect(draft.publicRef).toMatch(/^LD-/);
    expect(await history(draft.id)).toEqual([]);
    expect((await refusal(saveDraft(agencyDb(), rig.deps(), cast.coordinator, { campaignId: cast.campaignId }))).code).toBe("invalid-input");
    expect((await refusal(saveDraft(agencyDb(), rig.deps(), cast.coordinator, { campaignId: cast.campaignId, prospectName: "Greta", prospectEmail: "not an email" }))).code).toBe("invalid-input");
    expect((await refusal(saveDraft(clientDb(), rig.deps(), cast.clientActor, { campaignId: cast.campaignId, prospectName: "Greta" }))).code).toBe("not-authorised");
    expect((await refusal(saveDraft(agencyDb(), rig.deps(), cast.otherAgency, { campaignId: cast.campaignId, prospectName: "Greta" }))).code).toMatch(/not-found|not-authorised/);
  });

  it("is read by its own organisation and Fynix, and by nobody else: not the client, not the coordinator of a partner agency, not another agency", async () => {
    const draft = await saveDraft(agencyDb(), rig.deps(), cast.partner, { campaignId: cast.campaignId, prospectName: "Greta Voss" });
    // The lead tables leave drafts out (they are not leads yet); the owner's drafts list and its own record read hold them.
    expect((await listAgencyLeads(agencyDb(), cast.partner)).map((row) => row.id)).not.toContain(draft.id);
    expect((await listAgencyDrafts(agencyDb(), cast.partner)).map((row) => row.id)).toEqual([draft.id]);
    expect((await listFynixLeads(rig.dbs.roles.leads_fynix.db, rig.actor)).map((row) => row.id)).not.toContain(draft.id);
    expect((await listAgencyDrafts(agencyDb(), cast.coordinator)).map((row) => row.id)).toEqual([]);
    expect((await getOwnDraft(agencyDb(), cast.partner, draft.publicRef)).id).toBe(draft.id);
    expect((await refusal(getOwnDraft(agencyDb(), cast.coordinator, draft.publicRef))).code).toBe("not-found");
    expect((await listClientLeads(clientDb(), cast.clientActor)).map((row) => row.id)).not.toContain(draft.id);
    expect((await listAgencyLeads(agencyDb(), cast.coordinator)).map((row) => row.id)).not.toContain(draft.id);
    expect((await listAgencyLeads(agencyDb(), cast.otherAgency)).map((row) => row.id)).not.toContain(draft.id);
    expect((await refusal(getLeadRecordForClient(clientDb(), cast.clientActor, draft.publicRef))).code).toBe("not-found");
    expect((await refusal(getLeadRecordForSupply(agencyDb(), cast.coordinator, draft.publicRef))).code).toBe("not-found");
    expect((await getLeadRecordForSupply(agencyDb(), cast.partner, draft.publicRef)).stage).toBe("draft");
    // Straight into the tables, as the client and the coordinator.
    const countDrafts = (actor: TenantActor, db: ReturnType<typeof clientDb>) => asTenant(db, actor, async (tx) => (await tx.execute<{ n: string }>(sql`select count(*)::text as n from lead where stage = 'draft'`)).rows[0]?.n);
    expect(await countDrafts(cast.clientActor, clientDb())).toBe("0");
    expect(await countDrafts(cast.coordinator, agencyDb())).toBe("0");
    expect(await countDrafts(cast.partner, agencyDb())).toBe("1");
  });

  it("hides the history of a draft from the client and the coordinator even after the draft is sent", async () => {
    const draft = await saveDraft(agencyDb(), rig.deps(), cast.partner, fullLead({ aliasIdentityId: cast.partnerAlias }));
    await submitDraft(agencyDb(), rig.deps(), cast.partner, { leadId: draft.id });
    expect((await getLeadRecordForClient(clientDb(), cast.clientActor, draft.publicRef)).history.map((entry) => entry.action)).toEqual(["lead.submit"]);
  });

  it("is edited by its own organisation only, and only while it is a draft", async () => {
    const draft = await saveDraft(agencyDb(), rig.deps(), cast.coordinator, { campaignId: cast.campaignId, prospectName: "Greta Voss" });
    const edited = await updateDraft(agencyDb(), rig.deps(), cast.coordinator, { leadId: draft.id, prospectName: "Greta Voss-Lind", prospectEmail: "Greta@Voss.EXAMPLE", hostMemberId: cast.hostMemberId, aliasIdentityId: cast.coordinatorAlias });
    expect(edited).toMatchObject({ prospectName: "Greta Voss-Lind", prospectEmail: "greta@voss.example", prospectDomain: "voss.example", hostMemberId: cast.hostMemberId, stage: "draft" });
    expect((await refusal(updateDraft(agencyDb(), rig.deps(), cast.partner, { leadId: draft.id, prospectName: "Nope" }))).code).toBe("not-found");
    expect((await refusal(updateDraft(agencyDb(), rig.deps(), cast.coordinator, { leadId: draft.id, hostMemberId: cast.coordinator.userId }))).code).toBe("invalid-input");
    const sent = await booked();
    expect((await refusal(updateDraft(agencyDb(), rig.deps(), cast.coordinator, { leadId: sent.leadId, prospectName: "Rewrite" }))).code).toBe("invalid-lead-stage");
    // The database agrees: an agency cannot rewrite a lead that has left draft.
    await denied(asTenant(agencyDb(), cast.coordinator, (tx) => tx.execute(sql`update lead set prospect_name = 'Rewrite' where id = ${sent.leadId}::uuid`)), /lead_draft_only/);
  });

  it("is discarded the soft way: withdrawn, closed, still hidden from the client, and it counts nothing", async () => {
    const draft = await saveDraft(agencyDb(), rig.deps(), cast.coordinator, { campaignId: cast.campaignId, prospectName: "Greta Voss" });
    const gone = await discardDraft(agencyDb(), rig.deps(), cast.coordinator, { leadId: draft.id });
    expect(gone).toMatchObject({ stage: "withdrawn", released: false });
    expect(gone.closedAt).toBeInstanceOf(Date);
    expect((await listClientLeads(clientDb(), cast.clientActor)).map((row) => row.id)).not.toContain(draft.id);
    expect(await history(draft.id)).toEqual(["lead.discard_draft"]);
    expect((await refusal(discardDraft(agencyDb(), rig.deps(), cast.coordinator, { leadId: draft.id }))).code).toBe("invalid-lead-stage");
    expect(await clientCount()).toBe(0);
  });

  it("is sent through the full submission rules: incomplete is refused, a complete one reaches the client and is released", async () => {
    const draft = await saveDraft(agencyDb(), rig.deps(), cast.coordinator, { campaignId: cast.campaignId, prospectName: "Greta Voss" });
    expect((await refusal(submitDraft(agencyDb(), rig.deps(), cast.coordinator, { leadId: draft.id }))).code).toBe("invalid-input");

    const complete: Record<string, unknown> = fullLead({ prospectName: "Greta Voss" });
    delete complete.campaignId;
    await updateDraft(agencyDb(), rig.deps(), cast.coordinator, { leadId: draft.id, ...complete });
    rig.clock.now = new Date("2026-12-09T09:00:00Z");
    const sent = await submitDraft(agencyDb(), rig.deps(), cast.coordinator, { leadId: draft.id });
    expect(sent).toMatchObject({ stage: "awaiting_client", released: true });
    expect(sent.submittedAt.toISOString()).toBe("2026-12-09T09:00:00.000Z");
    expect((await listClientLeads(clientDb(), cast.clientActor)).map((row) => row.id)).toContain(draft.id);
    expect(await history(draft.id)).toEqual(["lead.submit"]);
    expect((await refusal(submitDraft(agencyDb(), rig.deps(), cast.coordinator, { leadId: draft.id }))).code).toBe("invalid-lead-stage");
  });

  it("runs the duplicate and exclusion checks when it is sent, and is nobody else's duplicate while it is a draft", async () => {
    const taken = fullLead();
    await submitLead(agencyDb(), rig.deps(), cast.coordinator, taken);
    const clash = await saveDraft(agencyDb(), rig.deps(), cast.partner, { ...fullLead({ prospectEmail: taken.prospectEmail, prospectLinkedinUrl: taken.prospectLinkedinUrl, aliasIdentityId: cast.partnerAlias }) });
    expect((await refusal(submitDraft(agencyDb(), rig.deps(), cast.partner, { leadId: clash.id }))).code).toBe("prospect-duplicate");

    // A draft does not make a duplicate for anyone: the coordinator submits what the partner only drafted.
    const mine = fullLead();
    await saveDraft(agencyDb(), rig.deps(), cast.partner, { ...fullLead({ prospectEmail: mine.prospectEmail, prospectLinkedinUrl: mine.prospectLinkedinUrl, aliasIdentityId: cast.partnerAlias }) });
    await submitLead(agencyDb(), rig.deps(), cast.coordinator, mine);

    await addExclusionByClient(clientDb(), rig.deps(), cast.clientActor, { clientOrgId: cast.clientActor.orgId, kind: "domain", value: "blocked.example" });
    const blocked = await saveDraft(agencyDb(), rig.deps(), cast.coordinator, fullLead({ prospectDomain: "blocked.example", prospectEmail: "x@blocked.example" }));
    expect((await refusal(submitDraft(agencyDb(), rig.deps(), cast.coordinator, { leadId: blocked.id }))).code).toBe("prospect-excluded");
  });
});

describe("withdrawing a lead", () => {
  it("withdraws a lead that waits for the client: withdrawn, closed, counts zero, the client sees it as withdrawn", async () => {
    const sent = await submitLead(agencyDb(), rig.deps(), cast.partner, fullLead({ aliasIdentityId: cast.partnerAlias }));
    const withdrawn = await withdrawLead(agencyDb(), rig.deps(), cast.partner, { leadId: sent.id, note: "The prospect asked us to stop" });
    expect(withdrawn.stage).toBe("withdrawn");
    expect(withdrawn.closedAt).toBeInstanceOf(Date);
    expect((await listClientLeads(clientDb(), cast.clientActor)).find((row) => row.id === sent.id)?.stage).toBe("withdrawn");
    expect((await ownerDb().select().from(leadHistory).where(eq(leadHistory.leadId, sent.id))).find((entry) => entry.action === "lead.withdraw")).toMatchObject({ fromStage: "awaiting_client", toStage: "withdrawn", note: "The prospect asked us to stop", actorRole: "agency" });
    expect(await clientCount()).toBe(0);
  });

  it("withdraws a booked lead, cancels its meeting and closes an open proposal to move it", async () => {
    const one = await booked("partner");
    await proposePostponement(clientDb(), rig.deps(), cast.clientActor, { meetingId: one.meetingId, proposedTimes: [nextWeekdayAt(10, 6)] });
    await withdrawLead(agencyDb(), rig.deps(), cast.partner, { leadId: one.leadId });
    expect((await row(one.leadId)).stage).toBe("withdrawn");
    expect((await ownerDb().select().from(meeting).where(eq(meeting.id, one.meetingId)))[0]?.outcome).toBe("cancelled");
    expect((await ownerDb().select().from(meetingReschedule).where(eq(meetingReschedule.meetingId, one.meetingId)))[0]?.status).toBe("superseded");
    expect((await getLeadRecordForClient(clientDb(), cast.clientActor, one.publicRef)).stage).toBe("withdrawn");
  });

  it("is for the sending organisation only, and only before the meeting", async () => {
    const one = await booked("partner");
    expect((await refusal(withdrawLead(agencyDb(), rig.deps(), cast.coordinator, { leadId: one.leadId }))).code).toBe("not-found");
    expect((await refusal(withdrawLead(agencyDb(), rig.deps(), cast.otherAgency, { leadId: one.leadId }))).code).toBe("not-found");
    expect((await refusal(withdrawLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId }))).code).toBe("not-authorised");
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.partner, { meetingId: one.meetingId, outcome: "held" });
    expect((await refusal(withdrawLead(agencyDb(), rig.deps(), cast.partner, { leadId: one.leadId }))).code).toBe("invalid-lead-stage");
  });
});

describe("postponing a meeting", () => {
  it("moves the same meeting, with the same row and link, when the other side picks one of the proposed times", async () => {
    const one = await booked();
    await ownerDb().update(meeting).set({ googleMeetUrl: "https://meet.google.com/abc-defg-hij" }).where(eq(meeting.id, one.meetingId));
    const [t1, t2] = [nextWeekdayAt(10, 6), nextWeekdayAt(14, 6)];
    const proposal = await proposePostponement(clientDb(), rig.deps(), cast.clientActor, { meetingId: one.meetingId, proposedTimes: [t1, t2] });
    expect(proposal).toMatchObject({ proposedBySide: "client", status: "open", pickedTime: null });
    expect((await row(one.leadId)).scheduledMeetingTime?.toISOString()).toBe(one.time);

    expect((await refusal(pickPostponement(clientDb(), rig.deps(), cast.clientActor, { rescheduleId: proposal.id, pickedTime: t1 }))).code).toBe("not-authorised");
    expect((await refusal(pickPostponement(agencyDb(), rig.deps(), cast.coordinator, { rescheduleId: proposal.id, pickedTime: nextWeekdayAt(9, 6) }))).code).toBe("invalid-input");
    const moved = await pickPostponement(agencyDb(), rig.deps(), cast.coordinator, { rescheduleId: proposal.id, pickedTime: t2 });
    expect(moved.scheduledStartTime.toISOString()).toBe(t2);

    const [booking] = await ownerDb().select().from(meeting).where(eq(meeting.leadId, one.leadId));
    expect(booking).toMatchObject({ id: one.meetingId, googleMeetUrl: "https://meet.google.com/abc-defg-hij", outcome: "scheduled" });
    expect(booking?.scheduledStartTime.toISOString()).toBe(t2);
    expect(await ownerDb().select({ id: meeting.id }).from(meeting).where(eq(meeting.leadId, one.leadId))).toHaveLength(1);
    expect((await row(one.leadId)).scheduledMeetingTime?.toISOString()).toBe(t2);
    const [stored] = await ownerDb().select().from(meetingReschedule).where(eq(meetingReschedule.id, proposal.id));
    expect(stored).toMatchObject({ status: "accepted", proposedByUserId: cast.clientActor.userId });
    expect(stored?.pickedTime?.toISOString()).toBe(t2);
    expect(await history(one.leadId)).toEqual(expect.arrayContaining(["meeting.postpone_propose", "meeting.postpone_pick"]));
    expect((await refusal(pickPostponement(agencyDb(), rig.deps(), cast.coordinator, { rescheduleId: proposal.id, pickedTime: t2 }))).code).toBe("invalid-lead-stage");
  });

  it("works from the supply side too, without a limit, and a new proposal supersedes the same side's open one", async () => {
    const one = await booked("partner");
    const first = await proposePostponement(agencyDb(), rig.deps(), cast.partner, { meetingId: one.meetingId, proposedTimes: [nextWeekdayAt(10, 5)] });
    const second = await proposePostponement(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, proposedTimes: [nextWeekdayAt(10, 6), nextWeekdayAt(11, 6), nextWeekdayAt(12, 6)] });
    const stored = await ownerDb().select().from(meetingReschedule).where(eq(meetingReschedule.meetingId, one.meetingId));
    expect(stored.find((entry) => entry.id === first.id)?.status).toBe("superseded");
    expect(stored.find((entry) => entry.id === second.id)?.status).toBe("open");
    // The client counter-proposes, then the supply side picks: again and again.
    for (let round = 0; round < 3; round += 1) {
      const counter = await proposePostponement(clientDb(), rig.deps(), cast.clientActor, { meetingId: one.meetingId, proposedTimes: [nextWeekdayAt(9, 7 + round)] });
      await pickPostponement(agencyDb(), rig.deps(), cast.partner, { rescheduleId: counter.id, pickedTime: nextWeekdayAt(9, 7 + round) });
    }
    const all = await ownerDb().select().from(meetingReschedule).where(eq(meetingReschedule.meetingId, one.meetingId));
    expect(all.filter((entry) => entry.status === "open")).toHaveLength(0);
    expect(all.filter((entry) => entry.status === "accepted")).toHaveLength(3);
  });

  it("takes one to three future, distinct times, from the side that holds the meeting, before an outcome", async () => {
    const one = await booked();
    const propose = (actor: TenantActor, proposedTimes: unknown) => proposePostponement(actor.orgKind === "client" ? clientDb() : agencyDb(), rig.deps(), actor, { meetingId: one.meetingId, proposedTimes });
    expect((await refusal(propose(cast.clientActor, []))).code).toBe("invalid-input");
    expect((await refusal(propose(cast.clientActor, [1, 2, 3, 4].map((day) => nextWeekdayAt(10, 6 + day))))).code).toBe("invalid-input");
    expect((await refusal(propose(cast.clientActor, [new Date(Date.now() - 3_600_000).toISOString()]))).code).toBe("invalid-input");
    expect((await refusal(propose(cast.clientActor, [nextWeekdayAt(10, 6), nextWeekdayAt(10, 6)]))).code).toBe("invalid-input");
    expect((await refusal(propose(cast.otherClient, [nextWeekdayAt(10, 6)]))).code).toBe("not-found");
    expect((await refusal(propose(cast.otherAgency, [nextWeekdayAt(10, 6)]))).code).toBe("not-found");
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, outcome: "held" });
    expect((await refusal(propose(cast.clientActor, [nextWeekdayAt(10, 6)]))).code).toBe("invalid-lead-stage");
  });

  it("shows each side the proposals of its own meetings and hides who proposed", async () => {
    const one = await booked();
    const proposal = await proposePostponement(clientDb(), rig.deps(), cast.clientActor, { meetingId: one.meetingId, proposedTimes: [nextWeekdayAt(10, 6)] });
    const seenBySupply = await listReschedules(agencyDb(), cast.coordinator, [one.meetingId]);
    expect(seenBySupply.map((entry) => entry.id)).toEqual([proposal.id]);
    expect(JSON.stringify(seenBySupply)).not.toContain(cast.clientActor.userId);
    expect(await listReschedules(agencyDb(), cast.otherAgency, [one.meetingId])).toEqual([]);
    expect(await listReschedules(clientDb(), cast.otherClient, [one.meetingId])).toEqual([]);
    expect(await listReschedules(agencyDb(), cast.partner, [one.meetingId])).toEqual([]);
    await denied(asTenant(agencyDb(), cast.coordinator, (tx) => tx.execute(sql`select proposed_by_user_id from meeting_reschedule`)), /permission denied for table meeting_reschedule/);
    await denied(asTenant(agencyDb(), cast.coordinator, (tx) => tx.execute(sql`select * from meeting_reschedule`)), /permission denied for table meeting_reschedule/);
    // A side cannot write as the other: the policy pins the side and the person.
    await denied(
      asTenant(agencyDb(), cast.coordinator, (tx) => tx.execute(sql`insert into meeting_reschedule (meeting_id, proposed_by_side, proposed_by_user_id, proposed_times) values (${one.meetingId}::uuid, 'client', ${cast.coordinator.userId}::uuid, '["2030-01-01T10:00:00Z"]'::jsonb)`)),
      /row-level security/,
    );
  });
});

describe("contesting an outcome", () => {
  it("is done by the other side with a note: the meeting is flagged, the lead moves to outcome_contested, and the sweep leaves it alone", async () => {
    const one = await booked();
    const recordedAt = new Date("2026-12-01T12:00:00Z");
    rig.clock.now = recordedAt;
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, outcome: "held" });
    rig.clock.now = atMs(recordedAt, 5);
    expect((await refusal(contestOutcome(clientDb(), rig.deps(), cast.clientActor, { meetingId: one.meetingId, note: "no" }))).code).toBe("invalid-input");
    await contestOutcome(clientDb(), rig.deps(), cast.clientActor, { meetingId: one.meetingId, note: "The prospect never joined the call." });
    const [booking] = await ownerDb().select().from(meeting).where(eq(meeting.id, one.meetingId));
    expect(booking).toMatchObject({ contestNote: "The prospect never joined the call.", contestedByRole: "client", outcome: "held" });
    expect(booking?.contestedAt?.toISOString()).toBe(atMs(recordedAt, 5).toISOString());
    expect((await row(one.leadId)).stage).toBe("outcome_contested");
    expect(await sweepLeads(rig.deps(), atMs(recordedAt, 60))).toEqual([]);
    expect((await row(one.leadId)).stage).toBe("outcome_contested");
    expect((await refusal(decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, decision: "accept", note: "Accept it anyway" }))).code).toBe("invalid-lead-stage");
    expect((await listContests(rig.deps(), rig.staffActor)).map((entry) => [entry.leadRef, entry.contestedByRole, entry.outcome])).toEqual([[one.publicRef, "client", "held"]]);
    expect((await refusal(contestOutcome(clientDb(), rig.deps(), cast.clientActor, { meetingId: one.meetingId, note: "Once more please" }))).code).toBe("invalid-lead-stage");
  });

  it("lets the coordinator or an agency contest what the client recorded, as its own role", async () => {
    const mine = await booked("coordinator");
    const theirs = await booked("partner");
    for (const one of [mine, theirs]) await recordMeetingOutcome(clientDb(), rig.deps(), cast.clientActor, { meetingId: one.meetingId, outcome: "client_no_show" });
    await contestOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: mine.meetingId, note: "The client was on the call, we have the log." });
    await contestOutcome(agencyDb(), rig.deps(), cast.partner, { meetingId: theirs.meetingId, note: "The client was on the call, we have the log." });
    const roles = await ownerDb().select({ id: meeting.id, role: meeting.contestedByRole }).from(meeting);
    expect(roles.find((entry) => entry.id === mine.meetingId)?.role).toBe("coordinator");
    expect(roles.find((entry) => entry.id === theirs.meetingId)?.role).toBe("agency");
    // A client no-show was counting one; while it is contested it counts nothing.
    expect(await clientCount()).toBe(0);
    expect((await row(mine.leadId)).deliveredAt).toBeNull();
  });

  it("refuses the same side, Fynix's own outcome, a closed window, an unknown side and a lead the client has answered", async () => {
    const one = await booked();
    rig.clock.now = new Date("2026-12-01T12:00:00Z");
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, outcome: "held" });
    const note = "I disagree with the outcome.";
    expect((await refusal(contestOutcome(agencyDb(), rig.deps(), cast.partner, { meetingId: one.meetingId, note }))).code).toMatch(/not-found|not-authorised/);
    expect((await refusal(contestOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, note }))).code).toBe("not-authorised");
    expect((await refusal(contestOutcome(clientDb(), rig.deps(), cast.otherClient, { meetingId: one.meetingId, note }))).code).toBe("not-found");
    rig.clock.now = atMs(new Date("2026-12-01T12:00:00Z"), 48.5);
    expect((await refusal(contestOutcome(clientDb(), rig.deps(), cast.clientActor, { meetingId: one.meetingId, note }))).code).toBe("contest-window-closed");

    rig.clock.now = new Date("2026-12-01T12:00:00Z");
    const fynixOne = await booked();
    await fynixRecordMeetingOutcome(rig.dbs.roles.leads_fynix.db, rig.deps(), rig.actor, { meetingId: fynixOne.meetingId, outcome: "held" });
    expect((await refusal(contestOutcome(clientDb(), rig.deps(), cast.clientActor, { meetingId: fynixOne.meetingId, note }))).code).toBe("not-authorised");

    const answered = await booked();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: answered.meetingId, outcome: "held" });
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: answered.leadId, decision: "accept", note: "Accepted already" });
    expect((await refusal(contestOutcome(clientDb(), rig.deps(), cast.clientActor, { meetingId: answered.meetingId, note }))).code).toBe("invalid-lead-stage");
    expect((await refusal(contestOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: answered.meetingId, note }))).code).toBe("not-authorised");
  });

  it("is decided by Fynix: held goes back to the client with a fresh 48 hours and fresh reminders, a client no-show counts, a prospect no-show closes", async () => {
    const start = new Date("2026-12-01T12:00:00Z");
    const contested = async (outcome: "held" | "client_no_show" | "prospect_no_show", by: "coordinator" | "client" = "coordinator") => {
      const one = await booked();
      rig.clock.now = start;
      await recordMeetingOutcome(by === "coordinator" ? agencyDb() : clientDb(), rig.deps(), by === "coordinator" ? cast.coordinator : cast.clientActor, { meetingId: one.meetingId, outcome });
      rig.clock.now = atMs(start, 2);
      await contestOutcome(by === "coordinator" ? clientDb() : agencyDb(), rig.deps(), by === "coordinator" ? cast.clientActor : cast.coordinator, { meetingId: one.meetingId, note: "That outcome is wrong, see the log." });
      return one;
    };
    const decide = (leadId: string, outcome: "held" | "client_no_show" | "prospect_no_show", who = rig.actor) => fynixDecideContest(rig.deps(), who, leadId, outcome, "Checked the attendance record.");

    const held = await contested("prospect_no_show");
    rig.clock.now = atMs(start, 10);
    await decide(held.leadId, "held", rig.staffActor);
    const afterHeld = await row(held.leadId);
    expect(afterHeld).toMatchObject({ stage: "awaiting_decision", closedAt: null, deliveredAt: null });
    expect(afterHeld.outcomeRecordedAt?.toISOString()).toBe(atMs(start, 10).toISOString());
    expect((await ownerDb().select().from(meeting).where(eq(meeting.id, held.meetingId)))[0]).toMatchObject({ outcome: "held", recordedByRole: "fynix" });
    expect((await ownerDb().select().from(leadReminder).where(eq(leadReminder.leadId, held.leadId))).map((entry) => entry.dueAt.toISOString()).sort()).toEqual([atMs(start, 22).toISOString(), atMs(start, 34).toISOString(), atMs(start, 46).toISOString()]);
    expect(await sweepLeads(rig.deps(), atMs(start, 57))).toEqual([]);
    expect((await sweepLeads(rig.deps(), atMs(start, 58))).map((entry) => entry.id)).toEqual([held.leadId]);
    expect(await history(held.leadId)).toEqual(expect.arrayContaining(["meeting.contest", "meeting.contest_decided"]));
    expect((await audits("lead.decide_contest")).length).toBe(1);

    const noShow = await contested("held", "client");
    await decide(noShow.leadId, "client_no_show");
    expect((await row(noShow.leadId)).stage).toBe("client_no_show");
    expect((await row(noShow.leadId)).deliveredAt).toBeInstanceOf(Date);

    const closed = await contested("client_no_show");
    await decide(closed.leadId, "prospect_no_show");
    expect(await row(closed.leadId)).toMatchObject({ stage: "prospect_no_show", deliveredAt: null });
    expect((await row(closed.leadId)).closedAt).toBeInstanceOf(Date);
  });

  it("refuses a decision for a lead that is not contested, a short note and a client", async () => {
    const one = await booked();
    expect((await refusal(fynixDecideContest(rig.deps(), rig.actor, one.leadId, "held", "Checked the attendance record."))).code).toBe("invalid-lead-stage");
    expect((await refusal(fynixDecideContest(rig.deps(), rig.actor, one.leadId, "held", "no"))).code).toBe("invalid-input");
    expect((await refusal(fynixDecideContest(rig.deps(), { userId: cast.clientActor.userId }, one.leadId, "held", "Checked the attendance record."))).code).toBe("not-authorised");
  });
});

describe("asking Fynix to review a rejection", () => {
  async function rejectedLead(from: "coordinator" | "partner" = "partner") {
    const one = await booked(from);
    rig.clock.now = new Date("2026-12-01T12:00:00Z");
    await recordMeetingOutcome(agencyDb(), rig.deps(), from === "partner" ? cast.partner : cast.coordinator, { meetingId: one.meetingId, outcome: "held" });
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, decision: "reject", note: "The prospect was not senior enough." });
    return one;
  }

  it("is asked by the coordinator inside 48 hours, once, and Fynix reads it in a list", async () => {
    const one = await rejectedLead();
    rig.clock.now = atMs(new Date("2026-12-01T12:00:00Z"), 30);
    const created = await requestRejectionReview(agencyDb(), rig.deps(), cast.coordinator, { leadId: one.leadId, note: "The prospect is the CFO, see the LinkedIn profile." });
    expect(created).toMatchObject({ leadId: one.leadId, status: "open", note: "The prospect is the CFO, see the LinkedIn profile." });
    expect((await refusal(requestRejectionReview(agencyDb(), rig.deps(), cast.coordinator, { leadId: one.leadId, note: "Asking a second time please" }))).code).toBe("already-requested");
    const rows = await listRejectionReviews(rig.deps(), rig.staffActor);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ leadRef: one.publicRef, requestNote: "The prospect is the CFO, see the LinkedIn profile.", rejectionNote: "The prospect was not senior enough.", status: "open" });
    // The client reads history; nothing of the request is in it.
    expect((await getLeadRecordForClient(clientDb(), cast.clientActor, one.publicRef)).history.map((entry) => entry.action)).not.toContain("lead.request_review");
    await denied(asTenant(clientDb(), cast.clientActor, (tx) => tx.execute(sql`select * from rejection_review`)), /permission denied for table rejection_review/);
    await denied(asTenant(agencyDb(), cast.coordinator, (tx) => tx.execute(sql`select requested_by_user_id from rejection_review`)), /permission denied for table rejection_review/);
    expect(await asTenant(agencyDb(), cast.otherAgency, (tx) => tx.select(agencyRejectionReviewColumns).from(rejectionReview))).toEqual([]);
  });

  it("is refused after 48 hours, for a partner agency, a client, a lead that is not rejected and a rejection before the meeting", async () => {
    const one = await rejectedLead();
    const note = "Please look at this rejection again.";
    expect((await refusal(requestRejectionReview(agencyDb(), rig.deps(), cast.partner, { leadId: one.leadId, note }))).code).toBe("not-authorised");
    expect((await refusal(requestRejectionReview(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, note }))).code).toBe("not-authorised");
    expect((await refusal(requestRejectionReview(agencyDb(), rig.deps(), cast.otherAgency, { leadId: one.leadId, note }))).code).toBe("not-found");
    expect((await refusal(requestRejectionReview(agencyDb(), rig.deps(), cast.coordinator, { leadId: one.leadId, note: "no" }))).code).toBe("invalid-input");
    const open = await booked();
    expect((await refusal(requestRejectionReview(agencyDb(), rig.deps(), cast.coordinator, { leadId: open.leadId, note }))).code).toBe("invalid-lead-stage");
    rig.clock.now = atMs(new Date("2026-12-01T12:00:00Z"), 49);
    expect((await refusal(requestRejectionReview(agencyDb(), rig.deps(), cast.coordinator, { leadId: one.leadId, note }))).code).toBe("review-window-closed");
  });

  it("shrinks the count Fynix sees when a rejection is marked reviewed or changed, and resolves the request", async () => {
    const left = await rejectedLead("coordinator");
    const changed = await rejectedLead("partner");
    const untouched = await rejectedLead("coordinator");
    for (const one of [left, changed]) await requestRejectionReview(agencyDb(), rig.deps(), cast.coordinator, { leadId: one.leadId, note: "The prospect is the CFO, see the profile." });
    expect(await listRejections(rig.deps(), rig.staffActor)).toHaveLength(3);

    await markRejectionReviewed(rig.deps(), rig.staffActor, left.leadId, "Checked the call notes, the rejection stands.");
    expect((await listRejections(rig.deps(), rig.staffActor)).map((entry) => entry.leadRef).sort()).toEqual([changed.publicRef, untouched.publicRef].sort());
    expect((await listRejections(rig.deps(), rig.staffActor, "reviewed")).map((entry) => [entry.leadRef, entry.reviewedAt instanceof Date])).toEqual([[left.publicRef, true]]);
    expect(await listRejections(rig.deps(), rig.staffActor, "all")).toHaveLength(3);
    expect((await row(left.leadId)).stage).toBe("rejected");

    await fynixOverturnRejection(rig.dbs.roles.leads_fynix.db, rig.deps(), rig.actor, { leadId: changed.leadId, note: "The prospect signs off, accepted." });
    expect((await row(changed.leadId)).rejectionReviewedAt).toBeInstanceOf(Date);
    expect((await ownerDb().select().from(rejectionReview)).map((entry) => entry.status)).toEqual(["resolved", "resolved"]);
    expect((await listRejectionReviews(rig.deps(), rig.staffActor)).length).toBe(0);
    expect((await listRejectionReviews(rig.deps(), rig.staffActor, { includeResolved: true })).length).toBe(2);
    expect((await audits("lead.mark_rejection_reviewed")).length).toBe(1);
    expect((await refusal(markRejectionReviewed(rig.deps(), rig.actor, changed.leadId))).code).toBe("invalid-lead-stage");
  });
});

describe("Fynix acts on a lead", () => {
  it("corrects the prospect and the qualification with a note, names only the fields in the history and the audit row, and works for staff", async () => {
    const one = await booked();
    await fynixCorrectLead(rig.deps(), rig.staffActor, { leadId: one.leadId, note: "Corrected after the prospect called.", prospectTitle: "Chief Financial Officer", prospectEmail: "CFO@Nordvik.example", bantBudget: "Approved for this quarter" });
    expect(await row(one.leadId)).toMatchObject({ prospectTitle: "Chief Financial Officer", prospectEmail: "cfo@nordvik.example", prospectDomain: "nordvik.example", bantBudget: "Approved for this quarter" });
    const entry = (await ownerDb().select().from(leadHistory).where(eq(leadHistory.leadId, one.leadId))).find((item) => item.action === "lead.correct");
    expect(entry).toMatchObject({ actorRole: "fynix", note: "Corrected after the prospect called." });
    expect(JSON.stringify(entry?.snapshot)).not.toContain("cfo@");
    expect(JSON.stringify((await audits("lead.correct"))[0]?.after)).not.toContain("cfo@");
    expect((await refusal(fynixCorrectLead(rig.deps(), rig.actor, { leadId: one.leadId, note: "no", prospectTitle: "CEO" }))).code).toBe("invalid-input");
    expect((await refusal(fynixCorrectLead(rig.deps(), rig.actor, { leadId: one.leadId, note: "Nothing to change here." }))).code).toBe("invalid-input");
    expect((await refusal(fynixCorrectLead(rig.deps(), { userId: cast.clientActor.userId }, { leadId: one.leadId, note: "I am not Fynix, honestly", prospectTitle: "CEO" }))).code).toBe("not-authorised");
    const draft = await saveDraft(agencyDb(), rig.deps(), cast.coordinator, { campaignId: cast.campaignId, prospectName: "Greta Voss" });
    expect((await refusal(fynixCorrectLead(rig.deps(), rig.actor, { leadId: draft.id, note: "A draft is not Fynix's", prospectTitle: "CEO" }))).code).toBe("invalid-lead-stage");
  });

  it("answers for the client: picks a time, rejects before the meeting, accepts or rejects after it, with the source fynix", async () => {
    const waitingTimes = [nextWeekdayAt(10, 3), nextWeekdayAt(14, 3)];
    const waiting = await submitLead(agencyDb(), rig.deps(), cast.coordinator, fullLead({ proposedTimes: waitingTimes }));
    expect((await refusal(fynixAnswerForClient(rig.deps(), rig.actor, { leadId: waiting.id, answer: "pick_time", selectedMeetingTime: nextWeekdayAt(8, 9), note: "Picked for the client." }))).code).toBe("invalid-input");
    await fynixAnswerForClient(rig.deps(), rig.staffActor, { leadId: waiting.id, answer: "pick_time", selectedMeetingTime: waitingTimes[1], note: "The client asked us to book the afternoon." });
    expect((await row(waiting.id)).stage).toBe("scheduled");
    expect((await ownerDb().select().from(meeting).where(eq(meeting.leadId, waiting.id)))[0]).toMatchObject({ outcome: "scheduled", hostMemberId: cast.hostMemberId });

    await fynixAnswerForClient(rig.deps(), rig.actor, { leadId: waiting.id, answer: "reject_before", note: "The client said they are not interested." });
    expect(await row(waiting.id)).toMatchObject({ stage: "declined", decisionSource: "fynix", decisionByUserId: rig.actor.userId, decisionNote: "The client said they are not interested." });
    expect((await ownerDb().select().from(meeting).where(eq(meeting.leadId, waiting.id)))[0]?.outcome).toBe("cancelled");

    const after = await booked();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: after.meetingId, outcome: "held" });
    await fynixAnswerForClient(rig.deps(), rig.actor, { leadId: after.leadId, answer: "accept", note: "The client confirmed by phone." });
    expect(await row(after.leadId)).toMatchObject({ stage: "accepted", decisionSource: "fynix" });
    expect(await clientCount()).toBe(1);
    const other = await booked();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: other.meetingId, outcome: "held" });
    await fynixAnswerForClient(rig.deps(), rig.actor, { leadId: other.leadId, answer: "reject", note: "The client confirmed by phone." });
    expect(await row(other.leadId)).toMatchObject({ stage: "rejected", decisionSource: "fynix" });
    expect((await refusal(fynixAnswerForClient(rig.deps(), rig.actor, { leadId: other.leadId, answer: "accept", note: "Again for the client." }))).code).toBe("invalid-lead-stage");
    expect((await audits("lead.answer_for_client")).length).toBe(4);
  });

  it("marks a lead lost: closed, counting zero, its meeting cancelled; and refuses one that is counted", async () => {
    const one = await booked();
    await fynixMarkLost(rig.deps(), rig.staffActor, { leadId: one.leadId, note: "The prospect left the company." });
    expect(await row(one.leadId)).toMatchObject({ stage: "lost", deliveredAt: null });
    expect((await row(one.leadId)).closedAt).toBeInstanceOf(Date);
    expect((await ownerDb().select().from(meeting).where(eq(meeting.id, one.meetingId)))[0]?.outcome).toBe("cancelled");
    expect(await clientCount()).toBe(0);
    const counted = await booked();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: counted.meetingId, outcome: "client_no_show" });
    expect((await refusal(fynixMarkLost(rig.deps(), rig.actor, { leadId: counted.leadId, note: "Counted already, so refused" }))).code).toBe("invalid-lead-stage");
    expect((await audits("lead.mark_lost")).length).toBe(1);
  });

  it("approves a lead beyond a share by clearing the flag, once", async () => {
    const one = await booked();
    await ownerDb().update(lead).set({ overShare: true }).where(eq(lead.id, one.leadId));
    await fynixApproveOverShare(rig.deps(), rig.staffActor, { leadId: one.leadId, note: "Within the campaign target, approved." });
    expect((await row(one.leadId)).overShare).toBe(false);
    expect((await refusal(fynixApproveOverShare(rig.deps(), rig.actor, { leadId: one.leadId, note: "Within the campaign target, approved." }))).code).toBe("invalid-input");
    expect(await history(one.leadId)).toContain("lead.approve_over_share");
  });
});

describe("the host's availability on the lead form", () => {
  beforeEach(async () => {
    // Monday 09:00 to 17:00 in Europe/London instead of the 24 hour days of the cast, and one blocked afternoon.
    await ownerDb().delete(hostHours).where(eq(hostHours.memberId, cast.hostMemberId));
    await ownerDb().insert(hostHours).values({ memberId: cast.hostMemberId, timeZone: "Europe/London", weekday: 1, startMinute: 540, endMinute: 1020 });
    await ownerDb().insert(hostBlock).values({ memberId: cast.hostMemberId, startsAt: new Date("2030-01-07T14:00:00Z"), endsAt: new Date("2030-01-07T16:00:00Z"), note: "Private dentist" });
  });

  it("gives the supply side the host's name, title, zone, hours and blocked times, and never a note, an email or a phone", async () => {
    const availability = await getHostAvailability(agencyDb(), rig.deps(), cast.coordinator, cast.hostMemberId, cast.campaignId);
    expect(availability).toMatchObject({ displayName: cast.hostName, jobTitle: "Chief Operating Officer", timeZone: "Europe/London", hours: [{ weekday: 1, startMinute: 540, endMinute: 1020 }] });
    expect(availability.blocks).toHaveLength(1);
    const text = JSON.stringify(availability);
    for (const forbidden of [cast.clientUserEmail, "Private dentist", "phone"]) expect(text, forbidden).not.toContain(forbidden);
    expect((await refusal(getHostAvailability(agencyDb(), rig.deps(), cast.otherAgency, cast.hostMemberId, cast.campaignId))).code).toBe("not-found");
    expect((await refusal(getHostAvailability(clientDb(), rig.deps(), cast.clientActor, cast.hostMemberId, cast.campaignId))).code).toBe("not-authorised");
    expect((await refusal(getHostAvailability(agencyDb(), rig.deps(), cast.coordinator, cast.coordinator.userId, cast.campaignId))).code).toBe("not-found");
    // The form's host list now carries names.
    const options = await getLeadSubmissionOptions(agencyDb(), cast.coordinator);
    expect(options.hosts).toEqual([{ id: cast.hostMemberId, campaignId: cast.campaignId, name: cast.hostName, jobTitle: "Chief Operating Officer" }]);
    await denied(asTenant(clientDb(), cast.clientActor, (tx) => tx.execute(sql`select * from public.app_campaign_host_names(${cast.campaignId}::uuid)`)), /permission denied for function app_campaign_host_names/);
  });

  it("warns about proposed times outside the host's hours or inside a block, and never refuses the lead", async () => {
    const inside = "2030-01-07T10:00:00.000Z";
    const outside = "2030-01-08T10:00:00.000Z";
    const blocked = "2030-01-07T15:00:00.000Z";
    const { warnings } = await checkProposedTimes(agencyDb(), rig.deps(), cast.coordinator, { hostMemberId: cast.hostMemberId, campaignId: cast.campaignId, proposedTimes: [inside, outside, blocked] });
    expect(warnings.map((entry) => [entry.time, entry.code])).toEqual([[outside, "outside_host_hours"], [blocked, "host_blocked"]]);
    const sent = await submitLead(agencyDb(), rig.deps(), cast.coordinator, fullLead({ proposedTimes: [outside] }));
    expect(sent.stage).toBe("awaiting_client");
  });
});

describe("exports", () => {
  async function exportable() {
    const clean = await booked("partner");
    const hostile = await submitLead(agencyDb(), rig.deps(), cast.coordinator, fullLead({ prospectName: "=HYPERLINK(\"http://x\")", prospectCompany: "+Evil Co" }));
    const draft = await saveDraft(agencyDb(), rig.deps(), cast.coordinator, { campaignId: cast.campaignId, prospectName: "Draft Person" });
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.partner, { meetingId: clean.meetingId, outcome: "held" });
    return { clean, hostile, draft };
  }

  it("gives the client its leads and meetings with the prospect and the qualification, and never the source, the alias, a draft or another client's lead", async () => {
    const { clean, hostile, draft } = await exportable();
    const csv = await exportLeadsCsv(clientDb(), cast.clientActor);
    expect(csv).toContain(clean.publicRef);
    expect(csv).toContain(hostile.publicRef);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+Evil Co");
    expect(csv).not.toContain(draft.publicRef);
    for (const forbidden of [cast.partnerName, "Ridgeway", "Piet Ridge", cast.partner.orgId, cast.partner.userId]) expect(csv, forbidden).not.toContain(forbidden);
    expect(await exportLeadsCsv(clientDb(), cast.otherClient)).not.toContain(clean.publicRef);
    const meetings = await exportMeetingsCsv(clientDb(), cast.clientActor);
    expect(meetings).toContain(clean.publicRef);
    expect(meetings).toContain("agency");
    for (const forbidden of [cast.partnerName, cast.partner.userId, "recorded_by_user_id"]) expect(meetings, forbidden).not.toContain(forbidden);
    expect((await exportLeadsCsv(clientDb(), cast.clientActor, { stage: "accepted" })).split("\r\n")).toHaveLength(2);
  });

  it("gives the coordinator all its campaign's leads and an agency its own, without a client person, an email or a phone, and drafts of the owner only on request", async () => {
    const { clean, hostile, draft } = await exportable();
    const coordinator = await exportLeadsCsv(agencyDb(), cast.coordinator);
    const partner = await exportLeadsCsv(agencyDb(), cast.partner);
    expect(coordinator).toContain(clean.publicRef);
    expect(coordinator).toContain(hostile.publicRef);
    expect(partner).toContain(clean.publicRef);
    expect(partner).not.toContain(hostile.publicRef);
    expect(coordinator).not.toContain(draft.publicRef);
    expect(await exportLeadsCsv(agencyDb(), cast.coordinator, { stage: "draft" })).toContain(draft.publicRef);
    for (const csv of [coordinator, partner, await exportMeetingsCsv(agencyDb(), cast.coordinator), await exportMeetingsCsv(agencyDb(), cast.partner)]) {
      for (const forbidden of [cast.clientUserEmail, cast.clientUserName, cast.clientActor.userId, cast.clientActor.orgId, "@nordvik", "@vossfreight"]) expect(csv, forbidden).not.toContain(forbidden);
    }
    expect(await exportMeetingsCsv(agencyDb(), cast.partner)).toContain(clean.publicRef);
    expect(await exportLeadsCsv(agencyDb(), cast.otherAgency)).not.toContain(clean.publicRef);
  });

  it("gives Fynix every lead with its emails and the meetings with the client's name, and the filters narrow them", async () => {
    const { clean, hostile } = await exportable();
    const csv = await exportLeadsCsv(rig.dbs.roles.leads_fynix.db, rig.actor);
    expect(csv).toContain(clean.publicRef);
    expect(csv).toContain(hostile.publicRef);
    expect(csv).toContain("@nordvik");
    const meetings = await exportMeetingsCsv(rig.dbs.roles.leads_fynix.db, rig.staffActor);
    expect(meetings.split("\r\n")[0]).toContain("Client");
    expect(meetings).toContain(clean.publicRef);
    expect(await exportLeadsCsv(rig.dbs.roles.leads_fynix.db, rig.actor, { campaignId: "00000000-0000-4000-8000-000000000000" })).toBe(csv.split("\r\n")[0] + "\r\n");
    expect((await exportLeadsCsv(rig.dbs.roles.leads_fynix.db, rig.actor, { to: new Date(Date.now() - 86_400_000) })).split("\r\n")).toHaveLength(2);
    // Narrowed to the agency that sent the lead: the partner agency sent `clean`, the coordinator sent `hostile`.
    const fromPartner = await exportLeadsCsv(rig.dbs.roles.leads_fynix.db, rig.actor, { sourceOrgId: cast.partner.orgId });
    expect(fromPartner).toContain(clean.publicRef);
    expect(fromPartner).not.toContain(hostile.publicRef);
    const fromCoordinator = await exportLeadsCsv(rig.dbs.roles.leads_fynix.db, rig.actor, { sourceOrgId: cast.coordinator.orgId });
    expect(fromCoordinator).toContain(hostile.publicRef);
    expect(fromCoordinator).not.toContain(clean.publicRef);
    // The same narrowing for the meetings: the booked meeting belongs to the lead the partner agency sent.
    const meetingsFromPartner = await exportMeetingsCsv(rig.dbs.roles.leads_fynix.db, rig.actor, { sourceOrgId: cast.partner.orgId });
    expect(meetingsFromPartner).toContain(clean.publicRef);
    expect(await exportMeetingsCsv(rig.dbs.roles.leads_fynix.db, rig.actor, { sourceOrgId: cast.coordinator.orgId })).not.toContain(clean.publicRef);
    const listed = await listFynixMeetings(rig.dbs.roles.leads_fynix.db, rig.actor, { sourceOrgId: cast.partner.orgId });
    expect(listed.map((row) => row.leadRef)).toContain(clean.publicRef);
    expect(await listFynixMeetings(rig.dbs.roles.leads_fynix.db, rig.actor, { sourceOrgId: cast.coordinator.orgId })).toEqual([]);
  });
});

describe("the client's exclusion list", () => {
  const entry = { clientOrgId: "", kind: "domain" as const, value: "Competitor.example" };

  it("is kept by a client manager for its own organisation: add, list and remove, with the value normalised", async () => {
    const added = await addExclusionByClient(clientDb(), rig.deps(), cast.clientActor, { ...entry, clientOrgId: cast.clientActor.orgId, reason: "A direct competitor" });
    expect(added).toMatchObject({ kind: "domain", value: "competitor.example", reason: "A direct competitor" });
    expect((await refusal(addExclusionByClient(clientDb(), rig.deps(), cast.clientActor, { ...entry, clientOrgId: cast.clientActor.orgId }))).code).toBe("exclusion-conflict");
    await addExclusionByClient(clientDb(), rig.deps(), cast.clientActor, { clientOrgId: cast.clientActor.orgId, kind: "company", value: "Rival Logistics" });
    expect((await listClientExclusions(clientDb(), cast.clientActor)).map((item) => item.value).sort()).toEqual(["competitor.example", "Rival Logistics"].sort());
    expect(await listClientExclusions(clientDb(), cast.otherClient)).toEqual([]);
    await removeExclusionByClient(clientDb(), cast.clientActor, { exclusionId: added.id });
    expect((await listClientExclusions(clientDb(), cast.clientActor)).map((item) => item.value)).toEqual(["Rival Logistics"]);
  });

  it("is for managers of that client only", async () => {
    const plain = { ...cast.clientActor, role: "member" as const };
    await ownerDb().update(member).set({ role: "member" }).where(eq(member.userId, cast.clientActor.userId));
    expect((await refusal(addExclusionByClient(clientDb(), rig.deps(), plain, { ...entry, clientOrgId: plain.orgId }))).code).toBe("not-authorised");
    expect((await refusal(addExclusionByClient(clientDb(), rig.deps(), cast.clientActor, { ...entry, clientOrgId: cast.otherClient.orgId }))).code).toBe("not-authorised");
    const added = (await ownerDb().insert(exclusionEntry).values({ clientOrgId: cast.clientActor.orgId, kind: "domain", value: "competitor.example" }).returning({ id: exclusionEntry.id }))[0];
    if (added === undefined) throw new Error("No exclusion");
    expect((await refusal(removeExclusionByClient(clientDb(), cast.otherClient, { exclusionId: added.id }))).code).toBe("not-found");
    expect((await refusal(removeExclusionByClient(clientDb(), plain, { exclusionId: added.id }))).code).toBe("not-authorised");
    // Straight into the table: a member's insert is refused by the policy, and an agency has no grant at all.
    await denied(asTenant(clientDb(), plain, (tx) => tx.execute(sql`insert into exclusion_entry (client_org_id, kind, value) values (${plain.orgId}::uuid, 'domain', 'x.example')`)), /row-level security/);
    await denied(asTenant(agencyDb(), cast.coordinator, (tx) => tx.execute(sql`select * from exclusion_entry`)), /permission denied for table exclusion_entry/);
  });

  it("makes a lead refuse an excluded prospect, with the reason, until the entry is removed", async () => {
    const added = await addExclusionByClient(clientDb(), rig.deps(), cast.clientActor, { clientOrgId: cast.clientActor.orgId, kind: "domain", value: "competitor.example" });
    const blocked = fullLead({ prospectDomain: "www.competitor.example", prospectEmail: "buyer@competitor.example" });
    const error = await refusal(submitLead(agencyDb(), rig.deps(), cast.coordinator, blocked));
    expect(error).toMatchObject({ code: "prospect-excluded", message: "This prospect is on the client exclusion list." });
    await addExclusionByClient(clientDb(), rig.deps(), cast.clientActor, { clientOrgId: cast.clientActor.orgId, kind: "email", value: "Someone@Elsewhere.example" });
    expect((await refusal(submitLead(agencyDb(), rig.deps(), cast.coordinator, fullLead({ prospectEmail: "someone@elsewhere.example" })))).code).toBe("prospect-excluded");
    // The refusal does not say which rule or what is on the list.
    expect(error.message).not.toContain("competitor");
    await removeExclusionByClient(clientDb(), cast.clientActor, { exclusionId: added.id });
    expect((await submitLead(agencyDb(), rig.deps(), cast.coordinator, blocked)).stage).toBe("awaiting_client");
    // Another client's list does not apply.
    await addExclusionByClient(clientDb(), rig.deps(), cast.otherClient, { clientOrgId: cast.otherClient.orgId, kind: "domain", value: "vossfreight99.example" });
    expect((await submitLead(agencyDb(), rig.deps(), cast.coordinator, fullLead({ prospectDomain: "vossfreight99.example", prospectEmail: "a@vossfreight99.example" }))).stage).toBe("awaiting_client");
  });
});

describe("the pipeline health Fynix reads", () => {
  it("counts delivered against the target per agency for the month, finds the oldest waiting lead and the overdue outcomes", async () => {
    const now = new Date("2026-12-10T12:00:00Z");
    rig.clock.now = now;
    const accepted = await booked("partner");
    const overdue = await booked("coordinator");
    const waiting = await submitLead(agencyDb(), rig.deps(), cast.partner, fullLead({ aliasIdentityId: cast.partnerAlias }));
    await ownerDb().update(lead).set({ submittedAt: new Date("2026-12-07T12:00:00Z") }).where(eq(lead.id, waiting.id));
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.partner, { meetingId: accepted.meetingId, outcome: "held" });
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: accepted.leadId, decision: "accept", note: "Accepted, a good fit." });
    await ownerDb().update(lead).set({ scheduledMeetingTime: new Date("2026-12-04T10:00:00Z") }).where(eq(lead.id, accepted.leadId));
    await ownerDb().update(lead).set({ scheduledMeetingTime: new Date("2026-12-09T10:00:00Z") }).where(eq(lead.id, overdue.leadId));

    const health = await readFynixPipelineHealth(rig.deps(), rig.staffActor, now);
    const mine = health.campaigns.find((entry) => entry.campaignId === cast.campaignId);
    expect(mine).toMatchObject({ month: "2026-12", target: 20, delivered: 1 });
    expect(mine?.byAgency.find((entry) => entry.agencyName === cast.partnerName)).toMatchObject({ share: 3, delivered: 1 });
    expect(mine?.byAgency.find((entry) => entry.agencyName !== cast.partnerName)).toMatchObject({ share: 5, delivered: 0 });
    expect(health.oldestWaiting).toMatchObject({ leadRef: waiting.publicRef, waitingHours: 72 });
    expect(health.overdueOutcomes.map((entry) => entry.leadRef)).toEqual([overdue.publicRef]);
    expect(health.overdueOutcomes[0]?.overdueHours).toBe(25);
  });
});

describe("what each role is granted of the new columns and tables", () => {
  const granted = async (role: string, table: string): Promise<string[]> =>
    (
      await ownerDb().execute<{ attname: string }>(
        sql.raw(`select attname from pg_attribute where attrelid = 'public.${table}'::regclass and attnum > 0 and not attisdropped and has_column_privilege('${role}', 'public.${table}', attname, 'SELECT') order by attnum`),
      )
    ).rows.map((entry) => entry.attname);

  it("lets the tenant roles read exactly the listed columns of a proposal and a review request", async () => {
    expect((await granted("leads_client", "meeting_reschedule")).sort()).toEqual(columnNames(clientRescheduleColumns).sort());
    expect((await granted("leads_agency", "meeting_reschedule")).sort()).toEqual(columnNames(agencyRescheduleColumns).sort());
    expect((await granted("leads_agency", "rejection_review")).sort()).toEqual(columnNames(agencyRejectionReviewColumns).sort());
    expect(await granted("leads_client", "rejection_review")).toEqual([]);
    const lead = await granted("leads_client", "lead");
    expect(lead).toContain("released");
    expect(lead).not.toContain("rejection_reviewed_at");
  });
});

describe("the reads the phase 4 screens use", () => {
  it("leaves discarded drafts out of the lead tables and the drafts list, and gives the client and Fynix the host's name", async () => {
    const draft = await saveDraft(agencyDb(), rig.deps(), cast.coordinator, { campaignId: cast.campaignId, prospectName: "Greta Voss" });
    await discardDraft(agencyDb(), rig.deps(), cast.coordinator, { leadId: draft.id });
    expect((await listAgencyLeads(agencyDb(), cast.coordinator)).map((entry) => entry.id)).not.toContain(draft.id);
    expect(await listAgencyDrafts(agencyDb(), cast.coordinator)).toEqual([]);
    const one = await booked("partner");
    const asClient = (await listClientLeads(clientDb(), cast.clientActor)).find((entry) => entry.id === one.leadId);
    expect(asClient?.hostName).toBe(cast.hostName);
    const asFynix = (await listFynixLeads(rig.dbs.roles.leads_fynix.db, rig.actor)).find((entry) => entry.id === one.leadId);
    expect(asFynix).toMatchObject({ hostName: cast.hostName, sourceName: cast.partnerName });
  });

  it("says which side has an open proposal on every meeting list, and the host on the client's and Fynix's", async () => {
    const one = await booked();
    const [t1] = [nextWeekdayAt(10, 6)];
    const find = <T extends { id: string }>(rows: readonly T[]) => rows.find((entry) => entry.id === one.meetingId);
    expect(find(await listClientMeetings(clientDb(), cast.clientActor))?.openProposalBy).toBeNull();
    const proposal = await proposePostponement(clientDb(), rig.deps(), cast.clientActor, { meetingId: one.meetingId, proposedTimes: [t1] });
    expect(find(await listClientMeetings(clientDb(), cast.clientActor))).toMatchObject({ openProposalBy: "client", hostName: cast.hostName });
    expect(find(await listAgencyMeetings(agencyDb(), cast.coordinator))?.openProposalBy).toBe("client");
    expect(find(await listFynixMeetings(rig.dbs.roles.leads_fynix.db, rig.actor))).toMatchObject({ openProposalBy: "client", hostName: cast.hostName });
    await pickPostponement(agencyDb(), rig.deps(), cast.coordinator, { rescheduleId: proposal.id, pickedTime: t1 });
    expect(find(await listClientMeetings(clientDb(), cast.clientActor))?.openProposalBy).toBeNull();
  });

  it("puts the proposals, the contest and the review request on the lead record for the side that may read them", async () => {
    const one = await booked("partner");
    const t1 = nextWeekdayAt(10, 6);
    await proposePostponement(agencyDb(), rig.deps(), cast.partner, { meetingId: one.meetingId, proposedTimes: [t1] });
    const forClient = await getLeadRecordForClient(clientDb(), cast.clientActor, one.publicRef);
    expect(forClient.reschedules).toMatchObject([{ proposedBySide: "supply", status: "open", proposedTimes: [t1] }]);
    expect(forClient.reviewRequest).toBeNull();
    expect((await getLeadRecordForSupply(agencyDb(), cast.partner, one.publicRef)).reschedules).toHaveLength(1);

    rig.clock.now = new Date("2026-12-01T12:00:00Z");
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.partner, { meetingId: one.meetingId, outcome: "held" });
    await contestOutcome(clientDb(), rig.deps(), cast.clientActor, { meetingId: one.meetingId, note: "We never met the prospect." });
    const contested = await getLeadRecordForClient(clientDb(), cast.clientActor, one.publicRef);
    expect(contested.meeting).toMatchObject({ contestNote: "We never met the prospect.", contestedByRole: "client", recordedByRole: "agency" });
    expect(contested.meeting?.contestedAt).not.toBeNull();
  });

  it("reads the review request on the coordinator's and Fynix's record and the over-share flag on the supply side, and never on the client's", async () => {
    const one = await booked("partner");
    rig.clock.now = new Date("2026-12-01T12:00:00Z");
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.partner, { meetingId: one.meetingId, outcome: "held" });
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, decision: "reject", note: "The prospect was not senior enough." });
    await requestRejectionReview(agencyDb(), rig.deps(), cast.coordinator, { leadId: one.leadId, note: "The prospect is the CFO, see LinkedIn." });
    expect((await getLeadRecordForSupply(agencyDb(), cast.coordinator, one.publicRef)).reviewRequest).toMatchObject({ note: "The prospect is the CFO, see LinkedIn.", status: "open" });
    expect((await getLeadRecordForSupply(agencyDb(), cast.partner, one.publicRef)).reviewRequest).toBeNull();
    expect((await getLeadRecordForClient(clientDb(), cast.clientActor, one.publicRef)).reviewRequest).toBeNull();
    const asFynix = await getLeadRecordForFynix(rig.deps(), rig.staffActor, one.publicRef);
    expect(asFynix.reviewRequest).toMatchObject({ note: "The prospect is the CFO, see LinkedIn." });
    expect(asFynix.reviewed).toBe(false);
    await markRejectionReviewed(rig.deps(), rig.staffActor, one.leadId);
    expect((await getLeadRecordForFynix(rig.deps(), rig.staffActor, one.publicRef)).reviewed).toBe(true);
  });
});
