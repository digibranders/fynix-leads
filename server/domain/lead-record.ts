import type { QualificationCheck } from "@/lib/qualification-checks";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { CampaignStatus } from "@/lib/domain/campaign-status";
import { countedMonth, isCountedStage } from "@/lib/domain/counting-month";
import { agencyLeadColumns, agencyMeetingColumns, agencyRejectionReviewColumns, agencyRescheduleColumns, clientLeadColumns, clientMeetingColumns, clientRescheduleColumns } from "@/server/db/columns";
import type { Database } from "@/server/db/pool";
import { aliasIdentity, campaign, hostHours, lead, leadHistory, meeting, meetingReschedule, member, organisation, rejectionReview } from "@/server/db/schema";
import { withTenantScope, type ScopedTransaction } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";

/**
 * What a lead record screen needs, per portal. The three reads share one shape and differ in what they may say:
 * - the client sees the alias name and title that wrote to the prospect, its own people's names, and never the source organisation;
 * - the coordinator and the agencies see the client's note as from the client (`decision.source`), never the person: no name, no id, and the
 *   host is a job title only;
 * - Fynix sees everything, with names.
 * `by` on a history row is a side, never a person.
 */
export type HistorySide = "client" | "supply" | "fynix" | "system";

export interface LeadRecordHistory {
  readonly id: string;
  readonly by: HistorySide;
  /** The person's name, for Fynix only. */
  readonly actorName: string | null;
  readonly action: string;
  readonly fromStage: string | null;
  readonly toStage: string | null;
  readonly note: string | null;
  readonly at: Date;
}

export interface LeadRecordMeeting {
  readonly id: string;
  readonly publicRef: string;
  readonly scheduledStartTime: Date;
  readonly durationMinutes: number;
  readonly googleMeetUrl: string | null;
  readonly outcome: string;
  readonly recordedAt: Date | null;
  /** Which side recorded the outcome first. */
  readonly recordedByRole: string | null;
  /** The contest of the recorded outcome, when one was made. The side is a side, never a person. */
  readonly contestedAt: Date | null;
  readonly contestNote: string | null;
  readonly contestedByRole: string | null;
}

/** A proposal to move the booked meeting. `proposedBySide` is "client" or "supply", never a person. */
export interface RescheduleView {
  readonly id: string;
  readonly proposedBySide: "client" | "supply";
  readonly proposedTimes: readonly string[];
  readonly status: string;
  readonly pickedTime: Date | null;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
}

/** The coordinator's request for a review of a rejection. Never read on a client screen. */
export interface ReviewRequestView {
  readonly note: string;
  readonly requestedAt: Date;
  readonly status: string;
}

export interface LeadRecord {
  readonly id: string;
  readonly publicRef: string;
  readonly stage: string;
  readonly campaignId: string;
  readonly campaignName: string;
  readonly campaignStatus: CampaignStatus;
  readonly prospect: {
    readonly name: string;
    readonly title: string;
    readonly company: string;
    readonly domain: string;
    readonly linkedinUrl: string;
    readonly email: string;
    readonly phone: string | null;
    readonly notes: string | null;
  };
  readonly bant: { readonly budget: string; readonly authority: string; readonly need: string; readonly timeline: string };
  /** The checklist the source agency ticked when it sent the lead, and its note (migration 0111). Empty for a lead sent before checklists. */
  readonly qualification: { readonly checks: readonly QualificationCheck[]; readonly notes: string };
  readonly proposedTimes: readonly string[];
  readonly scheduledMeetingTime: Date | null;
  /** The host: a name for the client and Fynix, a job title for the supply side. */
  readonly host: { readonly name: string | null; readonly jobTitle: string | null };
  /** The zone the host's weekly hours are set in, or null when none are set. Times are shown in it beside the viewer's own. */
  readonly hostTimeZone: string | null;
  /** The alias that wrote to the prospect. Null when the viewer may not read it (a coordinator reading a partner agency's lead). */
  readonly alias: { readonly displayName: string; readonly jobTitle: string } | null;
  readonly meeting: LeadRecordMeeting | null;
  /** The answer after the meeting, or the rejection before it, with its note. `source` says who: the client, the 48 hour sweep or Fynix. */
  readonly decision: { readonly note: string; readonly at: Date | null; readonly source: "client" | "auto" | "fynix"; readonly byName: string | null } | null;
  /** Whether the lead adds one today (`isCountedStage`). */
  readonly counted: boolean;
  readonly submittedAt: Date;
  readonly outcomeRecordedAt: Date | null;
  readonly closedAt: Date | null;
  /** Whether the lead went beyond a share and Fynix has not cleared it. Always false on a client screen. */
  readonly overShare: boolean;
  /** Fynix has looked at the rejection and left it as it was (or changed it). */
  readonly reviewed: boolean;
  /** Proposals to move the meeting, newest first. */
  readonly reschedules: readonly RescheduleView[];
  /** The coordinator's request for a review of the rejection: the coordinator and Fynix read it, a client and an agency never. */
  readonly reviewRequest: ReviewRequestView | null;
  readonly history: readonly LeadRecordHistory[];
}

export interface SupplyLeadRecord extends LeadRecord {
  /** Where the lead came from: the viewer's own bookings or a partner agency, by name when the viewer may read it. */
  readonly source: { readonly own: boolean; readonly name: string | null };
}

export interface FynixLeadRecord extends LeadRecord {
  readonly clientName: string;
  readonly source: { readonly name: string };
  readonly aliasEmail: string | null;
  /** "YYYY-MM": the month a counted lead belongs to, in the campaign's time zone. Null while it does not count. */
  readonly countedMonth: string | null;
  readonly timeZone: string;
}

const sideOf = (role: string): HistorySide => (role === "client" ? "client" : role === "fynix" ? "fynix" : role === "system" ? "system" : "supply");

const times = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);

/**
 * The decision of a lead: a rejection before the meeting and the answer after it both live in `decision_*`. An old row has only `decline_reason`.
 * A decision with no `decision_source` and no note is no decision.
 */
function decisionOf(row: { decisionNote: string | null; decisionAt: Date | null; decisionSource: string | null; declineReason: string | null; closedAt: Date | null }, byName: string | null): LeadRecord["decision"] {
  if (row.decisionNote !== null && (row.decisionSource === "client" || row.decisionSource === "auto" || row.decisionSource === "fynix")) {
    return { note: row.decisionNote, at: row.decisionAt, source: row.decisionSource, byName };
  }
  if (row.declineReason !== null) return { note: row.declineReason, at: row.closedAt, source: "client", byName };
  return null;
}

type MeetingRow = { id: string; publicRef: string; scheduledStartTime: Date; durationMinutes: number; googleMeetUrl: string | null; outcome: string; recordedAt: Date | null; recordedByRole: string | null; contestedAt: Date | null; contestNote: string | null; contestedByRole: string | null };
const meetingOf = (row: MeetingRow | undefined): LeadRecordMeeting | null =>
  row === undefined
    ? null
    : { id: row.id, publicRef: row.publicRef, scheduledStartTime: row.scheduledStartTime, durationMinutes: row.durationMinutes, googleMeetUrl: row.googleMeetUrl, outcome: row.outcome, recordedAt: row.recordedAt, recordedByRole: row.recordedByRole, contestedAt: row.contestedAt, contestNote: row.contestNote, contestedByRole: row.contestedByRole };

/** A tenant's history read: no person id and no snapshot, for either role. */
const tenantHistory = (tx: Parameters<Parameters<typeof withTenantScope>[2]>[0], leadId: string) =>
  tx
    .select({ id: leadHistory.id, role: leadHistory.actorRole, action: leadHistory.action, fromStage: leadHistory.fromStage, toStage: leadHistory.toStage, note: leadHistory.note, at: leadHistory.createdAt })
    .from(leadHistory)
    .where(eq(leadHistory.leadId, leadId))
    .orderBy(asc(leadHistory.createdAt), asc(leadHistory.id));

const mapHistory = (rows: readonly { id: string; role: string; action: string; fromStage: string | null; toStage: string | null; note: string | null; at: Date; actorName?: string | null }[]): LeadRecordHistory[] =>
  rows.map((row) => ({ id: row.id, by: sideOf(row.role), actorName: row.actorName ?? null, action: row.action, fromStage: row.fromStage, toStage: row.toStage, note: row.note, at: row.at }));

/** The zone of a host's weekly hours. Both tenant roles may read it (migration 0032); a host with no hours has none. */
async function hostZone(tx: ScopedTransaction, hostMemberId: string | null): Promise<string | null> {
  if (hostMemberId === null) return null;
  const [row] = await tx.select({ timeZone: hostHours.timeZone }).from(hostHours).where(eq(hostHours.memberId, hostMemberId)).limit(1);
  return row?.timeZone ?? null;
}


const sideOfProposal = (side: string): "client" | "supply" => (side === "client" ? "client" : "supply");

const mapReschedules = (rows: readonly { id: string; proposedBySide: string; proposedTimes: unknown; status: string; pickedTime: Date | null; createdAt: Date; resolvedAt: Date | null }[]): RescheduleView[] =>
  rows.map((row) => ({ id: row.id, proposedBySide: sideOfProposal(row.proposedBySide), proposedTimes: times(row.proposedTimes), status: row.status, pickedTime: row.pickedTime, createdAt: row.createdAt, resolvedAt: row.resolvedAt }));

/** The proposals to move a meeting, through the viewer's own role and column list. */
async function readReschedules(tx: ScopedTransaction, meetingId: string | undefined, role: "client" | "agency"): Promise<RescheduleView[]> {
  if (meetingId === undefined) return [];
  const rows = await tx
    .select(role === "client" ? clientRescheduleColumns : agencyRescheduleColumns)
    .from(meetingReschedule)
    .where(eq(meetingReschedule.meetingId, meetingId))
    .orderBy(desc(meetingReschedule.createdAt));
  return mapReschedules(rows);
}

/** The record of one lead for a client: its prospect, qualification, times, host, the alias that wrote, the decision and the history. `not-found` for any other client's lead. */
export async function getLeadRecordForClient(db: Database, actor: TenantActor, leadPublicRef: string): Promise<LeadRecord> {
  if (actor.orgKind !== "client") throw new DomainError("not-authorised", "Only client members can read a client's lead record.");
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [row] = await tx
      .select({ ...clientLeadColumns, campaignName: campaign.name, campaignStatus: campaign.status })
      .from(lead)
      .innerJoin(campaign, eq(lead.campaignId, campaign.id))
      .where(and(eq(lead.publicRef, leadPublicRef), eq(campaign.clientOrgId, actor.orgId)))
      .limit(1);
    if (row === undefined) throw new DomainError("not-found", "There is no such lead.");

    const [meetingRow] = await tx.select(clientMeetingColumns).from(meeting).where(eq(meeting.leadId, row.id)).orderBy(asc(meeting.createdAt)).limit(1);
    // A client never reads a draft, so a lead it can read has a host; the guard keeps the type honest.
    const [hostRow] =
      row.hostMemberId === null
        ? []
        : await tx.select({ name: member.displayName, jobTitle: member.jobTitle }).from(member).where(eq(member.id, row.hostMemberId)).limit(1);
    const decider =
      row.decisionByUserId === null ? [] : await tx.select({ name: member.displayName }).from(member).where(eq(member.userId, row.decisionByUserId)).limit(1);
    const aliasRows = await tx.execute<{ display_name: string; job_title: string }>(sql`select display_name, job_title from public.app_lead_alias_name(${row.id}::uuid)`);
    const aliasRow = aliasRows.rows[0];
    const history = await tenantHistory(tx, row.id);

    return {
      id: row.id,
      publicRef: row.publicRef,
      stage: row.stage,
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      campaignStatus: row.campaignStatus,
      prospect: { name: row.prospectName, title: row.prospectTitle, company: row.prospectCompany, domain: row.prospectDomain, linkedinUrl: row.prospectLinkedinUrl, email: row.prospectEmail, phone: row.prospectPhone, notes: row.prospectNotes },
      bant: { budget: row.bantBudget, authority: row.bantAuthority, need: row.bantNeed, timeline: row.bantTimeline },
      qualification: { checks: row.qualificationChecks, notes: row.qualificationNotes },
      proposedTimes: times(row.proposedTimes),
      scheduledMeetingTime: row.scheduledMeetingTime,
      host: { name: hostRow?.name ?? null, jobTitle: hostRow?.jobTitle ?? null },
      hostTimeZone: await hostZone(tx, row.hostMemberId),
      alias: aliasRow === undefined ? null : { displayName: aliasRow.display_name, jobTitle: aliasRow.job_title },
      meeting: meetingOf(meetingRow),
      decision: decisionOf(row, decider[0]?.name ?? null),
      counted: isCountedStage(row.stage),
      submittedAt: row.submittedAt,
      outcomeRecordedAt: row.outcomeRecordedAt,
      closedAt: row.closedAt,
      overShare: false,
      reviewed: false,
      reschedules: await readReschedules(tx, meetingRow?.id, "client"),
      reviewRequest: null,
      history: mapHistory(history),
    };
  });
}

/**
 * The record of one lead for the supply side: the coordinator (every lead of its campaigns, its agencies' too) and an agency (its own). The
 * client's note reads as from the client and its person is never named; the host is a job title; the client's email and phone are the prospect's
 * only. `not-found` for a lead the viewer may not read.
 */
export async function getLeadRecordForSupply(db: Database, actor: TenantActor, leadPublicRef: string): Promise<SupplyLeadRecord> {
  if (actor.orgKind !== "agency") throw new DomainError("not-authorised", "Only coordinator or agency members can read this lead record.");
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    // No source filter: the lead policy limits an agency to its own leads and a coordinator to those of its campaigns.
    const [row] = await tx
      .select({ ...agencyLeadColumns, campaignName: campaign.name, campaignStatus: campaign.status })
      .from(lead)
      .innerJoin(campaign, eq(lead.campaignId, campaign.id))
      .where(eq(lead.publicRef, leadPublicRef))
      .limit(1);
    if (row === undefined) throw new DomainError("not-found", "There is no such lead.");

    const [meetingRow] = await tx.select(agencyMeetingColumns).from(meeting).where(eq(meeting.leadId, row.id)).orderBy(asc(meeting.createdAt)).limit(1);
    const [aliasRow] = row.aliasIdentityId === null ? [] : await tx.select({ displayName: aliasIdentity.displayName, jobTitle: aliasIdentity.jobTitle }).from(aliasIdentity).where(eq(aliasIdentity.id, row.aliasIdentityId)).limit(1);
    const own = row.sourceOrgId === actor.orgId;
    let sourceName: string | null = null;
    if (!own) {
      // A partner agency's name, through the function a coordinator is allowed (it holds no grant on organisations).
      const partners = await tx.execute<{ id: string; name: string }>(sql`select id, name from public.app_my_partner_agencies()`);
      sourceName = partners.rows.find((partner) => partner.id === row.sourceOrgId)?.name ?? null;
    }
    const history = await tenantHistory(tx, row.id);
    // Only the coordinator of the campaign holds a policy on review requests, so a partner agency reads none.
    const [review] = await tx.select(agencyRejectionReviewColumns).from(rejectionReview).where(eq(rejectionReview.leadId, row.id)).limit(1);

    return {
      id: row.id,
      publicRef: row.publicRef,
      stage: row.stage,
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      campaignStatus: row.campaignStatus,
      prospect: { name: row.prospectName, title: row.prospectTitle, company: row.prospectCompany, domain: row.prospectDomain, linkedinUrl: row.prospectLinkedinUrl, email: row.prospectEmail, phone: row.prospectPhone, notes: row.prospectNotes },
      bant: { budget: row.bantBudget, authority: row.bantAuthority, need: row.bantNeed, timeline: row.bantTimeline },
      qualification: { checks: row.qualificationChecks, notes: row.qualificationNotes },
      proposedTimes: times(row.proposedTimes),
      scheduledMeetingTime: row.scheduledMeetingTime,
      // The supply side reads neither the name nor the job title of a client person here. The lead form is where it picks one, by name.
      host: { name: null, jobTitle: null },
      hostTimeZone: await hostZone(tx, row.hostMemberId),
      alias: aliasRow ?? null,
      meeting: meetingOf(meetingRow),
      decision: decisionOf(row, null),
      counted: isCountedStage(row.stage),
      submittedAt: row.submittedAt,
      outcomeRecordedAt: row.outcomeRecordedAt,
      closedAt: row.closedAt,
      overShare: row.overShare,
      reviewed: row.rejectionReviewedAt !== null,
      reschedules: await readReschedules(tx, meetingRow?.id, "agency"),
      reviewRequest: review === undefined ? null : { note: review.note, requestedAt: review.requestedAt, status: review.status },
      history: mapHistory(history),
      source: { own, name: sourceName },
    };
  });
}

/** The record of one lead for Fynix, admin or staff: everything, with the names of the people. */
export async function getLeadRecordForFynix(deps: DomainDeps, actor: FynixActor, leadPublicRef: string): Promise<FynixLeadRecord> {
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const clientOrg = alias(organisation, "client_org");
    const sourceOrg = alias(organisation, "source_org");
    const host = alias(member, "host");
    const decider = alias(member, "decider");
    const [row] = await tx
      .select({
        lead,
        campaignName: campaign.name,
        campaignStatus: campaign.status,
        timeZone: campaign.timeZone,
        clientName: clientOrg.name,
        sourceName: sourceOrg.name,
        hostName: host.displayName,
        hostJobTitle: host.jobTitle,
        aliasName: aliasIdentity.displayName,
        aliasJobTitle: aliasIdentity.jobTitle,
        aliasEmail: aliasIdentity.aliasEmail,
        deciderName: decider.displayName,
      })
      .from(lead)
      .innerJoin(campaign, eq(lead.campaignId, campaign.id))
      .innerJoin(clientOrg, eq(clientOrg.id, campaign.clientOrgId))
      .innerJoin(sourceOrg, eq(sourceOrg.id, lead.sourceOrgId))
      .leftJoin(host, eq(host.id, lead.hostMemberId))
      .leftJoin(aliasIdentity, eq(aliasIdentity.id, lead.aliasIdentityId))
      .leftJoin(decider, eq(decider.userId, lead.decisionByUserId))
      .where(eq(lead.publicRef, leadPublicRef))
      .limit(1);
    if (row === undefined) throw new DomainError("not-found", "There is no such lead.");
    const l = row.lead;

    const [meetingRow] = await tx.select(agencyMeetingColumns).from(meeting).where(eq(meeting.leadId, l.id)).orderBy(asc(meeting.createdAt)).limit(1);
    const history = await tx
      .select({ id: leadHistory.id, role: leadHistory.actorRole, actorName: member.displayName, action: leadHistory.action, fromStage: leadHistory.fromStage, toStage: leadHistory.toStage, note: leadHistory.note, at: leadHistory.createdAt })
      .from(leadHistory)
      .leftJoin(member, eq(member.userId, leadHistory.actorUserId))
      .where(eq(leadHistory.leadId, l.id))
      .orderBy(asc(leadHistory.createdAt), asc(leadHistory.id));
    const counted = isCountedStage(l.stage);
    const [review] = await tx
      .select({ note: rejectionReview.note, requestedAt: rejectionReview.requestedAt, status: rejectionReview.status })
      .from(rejectionReview)
      .where(eq(rejectionReview.leadId, l.id))
      .limit(1);
    const proposals = meetingRow === undefined ? [] : await tx.select({ id: meetingReschedule.id, proposedBySide: meetingReschedule.proposedBySide, proposedTimes: meetingReschedule.proposedTimes, status: meetingReschedule.status, pickedTime: meetingReschedule.pickedTime, createdAt: meetingReschedule.createdAt, resolvedAt: meetingReschedule.resolvedAt }).from(meetingReschedule).where(eq(meetingReschedule.meetingId, meetingRow.id)).orderBy(desc(meetingReschedule.createdAt));

    return {
      id: l.id,
      publicRef: l.publicRef,
      stage: l.stage,
      campaignId: l.campaignId,
      campaignName: row.campaignName,
      campaignStatus: row.campaignStatus,
      prospect: { name: l.prospectName, title: l.prospectTitle, company: l.prospectCompany, domain: l.prospectDomain, linkedinUrl: l.prospectLinkedinUrl, email: l.prospectEmail, phone: l.prospectPhone, notes: l.prospectNotes },
      bant: { budget: l.bantBudget, authority: l.bantAuthority, need: l.bantNeed, timeline: l.bantTimeline },
      qualification: { checks: l.qualificationChecks, notes: l.qualificationNotes },
      proposedTimes: times(l.proposedTimes),
      scheduledMeetingTime: l.scheduledMeetingTime,
      host: { name: row.hostName ?? null, jobTitle: row.hostJobTitle },
      hostTimeZone: (await hostZone(tx, l.hostMemberId)) ?? row.timeZone,
      alias: row.aliasName === null || row.aliasJobTitle === null ? null : { displayName: row.aliasName, jobTitle: row.aliasJobTitle },
      meeting: meetingOf(meetingRow),
      decision: decisionOf(l, row.deciderName),
      counted,
      submittedAt: l.submittedAt,
      outcomeRecordedAt: l.outcomeRecordedAt,
      closedAt: l.closedAt,
      overShare: l.overShare,
      reviewed: l.rejectionReviewedAt !== null,
      reschedules: mapReschedules(proposals),
      reviewRequest: review === undefined ? null : { note: review.note, requestedAt: review.requestedAt, status: review.status },
      history: mapHistory(history),
      clientName: row.clientName,
      source: { name: row.sourceName },
      aliasEmail: row.aliasEmail,
      countedMonth: counted && l.scheduledMeetingTime !== null ? countedMonth(l.scheduledMeetingTime, row.timeZone) : null,
      timeZone: row.timeZone,
    };
  });
}
