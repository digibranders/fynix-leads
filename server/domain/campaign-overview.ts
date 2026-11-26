import { and, asc, count, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { CampaignStatus } from "@/lib/domain/campaign-status";
import { countedMonth, isCountedStage } from "@/lib/domain/counting-month";
import { summariseShares, type ShareSummary } from "@/lib/domain/share-allocation";
import type { HoursWindow } from "@/lib/domain/weekly-hours";
import { auditLog, campaign, campaignShare, clientContact, hostBlock, hostHours, lead, member, organisation } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";
import { acceptedByBothSides, readAgreements, type AgreementHistory, type AgreementSide } from "@/server/domain/agreements";
import { uuidSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";

/**
 * What the Fynix campaign screens read: the list, the header and brief, the hosts with their hours and blocks, and the
 * agreements with the shares. All Fynix reads, open to staff.
 */

const CAMPAIGN_REF = /^CMP-[0-9A-HJKMNP-TV-Z]{4}$/;

const client = alias(organisation, "client_org");
const coordinator = alias(organisation, "supplier_org");

export interface CampaignRow {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: CampaignStatus;
  readonly clientName: string;
  readonly coordinatorName: string;
}

/** Every campaign, newest first. */
export async function listCampaignRows(deps: DomainDeps, actor: FynixActor): Promise<readonly CampaignRow[]> {
  return fynixRead(deps.fynixDb, actor, (tx) =>
    tx
      .select({ id: campaign.id, publicRef: campaign.publicRef, name: campaign.name, status: campaign.status, clientName: client.name, coordinatorName: coordinator.name })
      .from(campaign)
      .innerJoin(client, eq(client.id, campaign.clientOrgId))
      .innerJoin(coordinator, eq(coordinator.id, campaign.agencyOrgId))
      .orderBy(desc(campaign.createdAt), asc(campaign.name)),
  );
}

/** A contact person at a client, as the New campaign page offers them in the "contact person" list once a client is chosen. */
export interface ContactChoice {
  readonly id: string;
  readonly clientOrgId: string;
  readonly name: string;
  readonly jobTitle: string | null;
}

export interface CampaignChoices {
  readonly clients: readonly { readonly id: string; readonly name: string }[];
  readonly coordinators: readonly { readonly id: string; readonly name: string }[];
  /** Every live contact person of every client, so the page can filter them by the client chosen. */
  readonly contacts: readonly ContactChoice[];
}

/** The active clients and coordinators a new campaign can be made for. A partner agency is not a coordinator, so it is left out. */
export async function listCampaignChoices(deps: DomainDeps, actor: FynixActor): Promise<CampaignChoices> {
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const rows = await tx.select({ id: organisation.id, name: organisation.name, kind: organisation.kind, parentOrgId: organisation.parentOrgId }).from(organisation).where(eq(organisation.status, "active")).orderBy(asc(organisation.name));
    const contacts = await tx
      .select({ id: clientContact.id, clientOrgId: clientContact.clientOrgId, name: clientContact.name, jobTitle: clientContact.jobTitle })
      .from(clientContact)
      .where(isNull(clientContact.removedAt))
      .orderBy(asc(clientContact.createdAt), asc(clientContact.name));
    return {
      clients: rows.filter((row) => row.kind === "client").map(({ id, name }) => ({ id, name })),
      coordinators: rows.filter((row) => row.kind === "agency" && row.parentOrgId === null).map(({ id, name }) => ({ id, name })),
      contacts,
    };
  });
}

/** The campaign's brief as stored (spec section 6). Everything here is Fynix's to read, internal notes included. */
export interface CampaignBrief {
  readonly startDate: string;
  readonly endDate: string;
  readonly monthlyTarget: number;
  readonly totalTarget: number;
  readonly geography: string;
  readonly industries: readonly string[];
  readonly companySize: string;
  readonly icp: string;
  readonly jobTitles: readonly string[];
  readonly seniority: string;
  readonly technologies: readonly string[];
  readonly bantBudget: string;
  readonly bantAuthority: string;
  readonly bantNeed: string;
  readonly bantTimeline: string;
  readonly instructions: string;
  readonly pitchIntroduction: string;
  readonly pitchServices: string;
  readonly pitchDifferentiator: string;
  readonly pitchCollaterals: string;
  readonly pitchCaseStudies: string;
  readonly qualifyingQuestions: string;
  readonly firstEmail: string;
  readonly secondEmail: string;
  /** The client's contact person who approves leads for this campaign, if one is chosen. */
  readonly primaryContactId: string | null;
  readonly internalNotes: string | null;
}

export interface CampaignHeader {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: CampaignStatus;
  readonly clientOrgId: string;
  readonly clientName: string;
  /** The client's reference, for links to its pages. */
  readonly clientRef: string;
  readonly coordinatorOrgId: string;
  readonly coordinatorName: string;
  readonly timeZone: string;
  readonly meetingMinutes: number;
  /** The live contact people of the campaign's client, for the "contact person" list on Edit campaign. */
  readonly clientContacts: readonly ContactChoice[];
  /** Hosts who are switched on. */
  readonly activeHostCount: number;
  /** When the campaign was closed; null while it is not closed. */
  readonly closedAt: Date | null;
  readonly brief: CampaignBrief;
}

/** One campaign by its public reference, for the header and the Brief tab. An unknown reference is `not-found`. */
export async function readCampaignHeader(deps: DomainDeps, actor: FynixActor, publicRef: string): Promise<CampaignHeader> {
  if (!CAMPAIGN_REF.test(publicRef)) throw new DomainError("not-found", "There is no such campaign.");
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const [row] = await tx
      .select({
        id: campaign.id,
        publicRef: campaign.publicRef,
        name: campaign.name,
        status: campaign.status,
        clientOrgId: campaign.clientOrgId,
        clientName: client.name,
        clientRef: client.publicRef,
        coordinatorOrgId: campaign.agencyOrgId,
        coordinatorName: coordinator.name,
        timeZone: campaign.timeZone,
        meetingMinutes: campaign.meetingMinutes,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        monthlyTarget: campaign.monthlyTarget,
        totalTarget: campaign.totalTarget,
        geography: campaign.geography,
        industries: campaign.industries,
        companySize: campaign.companySize,
        icp: campaign.icp,
        jobTitles: campaign.jobTitles,
        seniority: campaign.seniority,
        technologies: campaign.technologies,
        bantBudget: campaign.bantBudget,
        bantAuthority: campaign.bantAuthority,
        bantNeed: campaign.bantNeed,
        bantTimeline: campaign.bantTimeline,
        instructions: campaign.instructions,
        pitchIntroduction: campaign.pitchIntroduction,
        pitchServices: campaign.pitchServices,
        pitchDifferentiator: campaign.pitchDifferentiator,
        pitchCollaterals: campaign.pitchCollaterals,
        pitchCaseStudies: campaign.pitchCaseStudies,
        qualifyingQuestions: campaign.qualifyingQuestions,
        firstEmail: campaign.firstEmail,
        secondEmail: campaign.secondEmail,
        primaryContactId: campaign.primaryContactId,
        internalNotes: campaign.internalNotes,
        closedAt: campaign.closedAt,
      })
      .from(campaign)
      .innerJoin(client, eq(client.id, campaign.clientOrgId))
      .innerJoin(coordinator, eq(coordinator.id, campaign.agencyOrgId))
      .where(eq(campaign.publicRef, publicRef))
      .limit(1);
    if (row === undefined) throw new DomainError("not-found", "There is no such campaign.");
    const [hosts] = await tx.select({ n: count() }).from(member).where(and(eq(member.orgId, row.clientOrgId), eq(member.orgKind, "client"), eq(member.status, "active")));
    const clientContacts = await tx
      .select({ id: clientContact.id, clientOrgId: clientContact.clientOrgId, name: clientContact.name, jobTitle: clientContact.jobTitle })
      .from(clientContact)
      .where(and(eq(clientContact.clientOrgId, row.clientOrgId), isNull(clientContact.removedAt)))
      .orderBy(asc(clientContact.createdAt), asc(clientContact.name));
    const { id, publicRef: ref, name, status, clientOrgId, clientName, clientRef, coordinatorOrgId, coordinatorName, timeZone, meetingMinutes, closedAt, ...brief } = row;
    return { id, publicRef: ref, name, status, clientOrgId, clientName, clientRef, coordinatorOrgId, coordinatorName, timeZone, meetingMinutes, clientContacts, activeHostCount: hosts?.n ?? 0, closedAt, brief };
  });
}

export interface HostBlockView {
  readonly id: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly note: string;
}

export interface HostView {
  readonly memberId: string;
  readonly displayName: string;
  readonly jobTitle: string;
  /** The zone the weekly hours are in, or `null` when no hours are set. */
  readonly timeZone: string | null;
  readonly hours: readonly HoursWindow[];
  /** Blocked times that have not ended yet, soonest first. */
  readonly blocks: readonly HostBlockView[];
}

/** The active people of the campaign's client, by name, each with the weekly hours and the blocked times still to come. */
export async function listCampaignHosts(deps: DomainDeps, actor: FynixActor, campaignId: string): Promise<readonly HostView[]> {
  const id = parseInput(uuidSchema, campaignId);
  const now = deps.now();
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const [target] = await tx.select({ id: campaign.id, clientOrgId: campaign.clientOrgId }).from(campaign).where(eq(campaign.id, id)).limit(1);
    if (target === undefined) throw new DomainError("not-found", "There is no such campaign.");
    const people = await tx
      .select({ memberId: member.id, displayName: member.displayName, jobTitle: member.jobTitle })
      .from(member)
      .where(and(eq(member.orgId, target.clientOrgId), eq(member.orgKind, "client"), eq(member.status, "active")))
      .orderBy(asc(member.displayName));
    const ids = people.map((row) => row.memberId);
    const hours =
      ids.length === 0
        ? []
        : await tx
            .select({ memberId: hostHours.memberId, timeZone: hostHours.timeZone, weekday: hostHours.weekday, startMinute: hostHours.startMinute, endMinute: hostHours.endMinute })
            .from(hostHours)
            .where(inArray(hostHours.memberId, ids))
            .orderBy(asc(hostHours.weekday), asc(hostHours.startMinute));
    const blocks =
      ids.length === 0
        ? []
        : await tx
            .select({ id: hostBlock.id, memberId: hostBlock.memberId, startsAt: hostBlock.startsAt, endsAt: hostBlock.endsAt, note: hostBlock.note })
            .from(hostBlock)
            .where(and(inArray(hostBlock.memberId, ids), gt(hostBlock.endsAt, now)))
            .orderBy(asc(hostBlock.startsAt));
    return people.map((row): HostView => {
      const own = hours.filter((entry) => entry.memberId === row.memberId);
      return {
        memberId: row.memberId,
        displayName: row.displayName,
        jobTitle: row.jobTitle ?? "",
        timeZone: own[0]?.timeZone ?? null,
        hours: own.map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute })),
        blocks: blocks.filter((entry) => entry.memberId === row.memberId).map(({ id: blockId, startsAt, endsAt, note }) => ({ id: blockId, startsAt, endsAt, note })),
      };
    });
  });
}

export interface AgreementView {
  readonly version: number;
  readonly monthlyTarget: number;
  readonly totalTarget: number;
  readonly disputeWindowHours: number;
  readonly rules: string;
  readonly notes: string;
  readonly createdAt: Date;
  /** Who accepted this version, first acceptance first, with the side they signed for. Empty while it waits. */
  readonly accepted: readonly { readonly name: string; readonly at: Date; readonly side: AgreementSide }[];
}

/** The one campaign agreement: the newest version, the version the one before it replaced, and the version in force while a newer one waits. */
export interface AgreementSideView {
  readonly current: AgreementView | null;
  /** The newest version both the client and the coordinator accepted, when it is not the current one. Its numbers are the campaign's meanwhile. */
  readonly inForceVersion: number | null;
  /** The version the current one replaced, with the day it was replaced. */
  readonly previous: { readonly version: number; readonly createdAt: Date; readonly supersededAt: Date } | null;
  /** Every earlier version, newest first, with its numbers and whether both sides accepted it. */
  readonly history: readonly AgreementHistoryLine[];
}

export interface AgreementHistoryLine {
  readonly version: number;
  readonly monthlyTarget: number;
  readonly totalTarget: number;
  readonly createdAt: Date;
  readonly acceptedByBoth: boolean;
}

export interface ShareView {
  readonly agencyOrgId: string;
  readonly agencyName: string;
  /** True for the coordinator's own bookings, false for a partner agency. */
  readonly ownBookings: boolean;
  readonly monthlyShare: number;
  /** Counted leads of this agency by month ("YYYY-MM", the month of the meeting in the campaign's time zone). A month with none is absent. */
  readonly countedByMonth: Readonly<Record<string, number>>;
  readonly updatedAt: Date;
  /** The admin who last set it, as the audit log has it. `null` when the log has no row (a share written by a script). */
  readonly changedBy: string | null;
}

export interface AgencyOption {
  readonly id: string;
  readonly name: string;
  readonly ownBookings: boolean;
}

export interface AgreementsPage {
  readonly agreement: AgreementSideView;
  readonly shares: readonly ShareView[];
  readonly summary: ShareSummary;
  /** Active agencies a share can still go to: the coordinator and its partner agencies that have none yet. */
  readonly options: readonly AgencyOption[];
}

const sideView = (history: AgreementHistory, names: ReadonlyMap<string, string>): AgreementSideView => {
  const { current } = history;
  const previous = history.history[0];
  return {
    inForceVersion: history.inForce === null || history.inForce.id === current?.id ? null : history.inForce.version,
    current:
      current === null
        ? null
        : {
            version: current.version,
            monthlyTarget: current.monthlyTarget,
            totalTarget: current.totalTarget,
            disputeWindowHours: current.disputeWindowHours,
            rules: current.rules,
            notes: current.notes,
            createdAt: current.createdAt,
            accepted: current.acceptances.map((entry) => ({ name: names.get(entry.userId) ?? "A signer", at: entry.acceptedAt, side: entry.side })),
          },
    previous: previous === undefined || current === null ? null : { version: previous.version, createdAt: previous.createdAt, supersededAt: current.createdAt },
    history: history.history.map((row) => ({ version: row.version, monthlyTarget: row.monthlyTarget, totalTarget: row.totalTarget, createdAt: row.createdAt, acceptedByBoth: acceptedByBothSides(row) })),
  };
};

/** The campaign agreement, the monthly shares with who last changed each, the over-allocation summary and the agencies still without a share. */
export async function readAgreementsPage(deps: DomainDeps, actor: FynixActor, campaignId: string): Promise<AgreementsPage> {
  const id = parseInput(uuidSchema, campaignId);
  const agreements = await readAgreements(deps, actor, id);
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const [target] = await tx.select({ id: campaign.id, coordinatorOrgId: campaign.agencyOrgId, monthlyTarget: campaign.monthlyTarget, timeZone: campaign.timeZone }).from(campaign).where(eq(campaign.id, id)).limit(1);
    if (target === undefined) throw new DomainError("not-found", "There is no such campaign.");

    const signerIds = (agreements.current?.acceptances ?? []).map((entry) => entry.userId);
    const signers =
      signerIds.length === 0 ? [] : await tx.select({ userId: member.userId, name: member.displayName }).from(member).where(inArray(member.userId, signerIds));
    const names = new Map(signers.map((row) => [row.userId, row.name]));

    const shareRows = await tx
      .select({ id: campaignShare.id, agencyOrgId: campaignShare.agencyOrgId, agencyName: organisation.name, monthlyShare: campaignShare.monthlyShare, updatedAt: campaignShare.updatedAt })
      .from(campaignShare)
      .innerJoin(organisation, eq(organisation.id, campaignShare.agencyOrgId))
      .where(eq(campaignShare.campaignId, id))
      .orderBy(asc(organisation.name));
    const changes =
      shareRows.length === 0
        ? []
        : await tx
            .select({ subjectId: auditLog.subjectId, name: member.displayName })
            .from(auditLog)
            .innerJoin(member, eq(member.userId, auditLog.actorUserId))
            .where(and(eq(auditLog.action, "campaign_share.set"), inArray(auditLog.subjectId, shareRows.map((row) => row.id))))
            .orderBy(desc(auditLog.at));
    const changedBy = new Map<string, string>();
    for (const row of changes) if (!changedBy.has(row.subjectId)) changedBy.set(row.subjectId, row.name);

    // Counted leads by agency and month: the one rule (`isCountedStage`) and the month of the meeting in the campaign's zone (`countedMonth`).
    const leadRows = await tx.select({ sourceOrgId: lead.sourceOrgId, stage: lead.stage, meetingTime: lead.scheduledMeetingTime }).from(lead).where(eq(lead.campaignId, id));
    const counted = new Map<string, Record<string, number>>();
    for (const row of leadRows) {
      if (!isCountedStage(row.stage) || row.meetingTime === null) continue;
      const months = counted.get(row.sourceOrgId) ?? {};
      const month = countedMonth(row.meetingTime, target.timeZone);
      months[month] = (months[month] ?? 0) + 1;
      counted.set(row.sourceOrgId, months);
    }

    const shares = shareRows.map(
      (row): ShareView => ({
        countedByMonth: counted.get(row.agencyOrgId) ?? {},
        agencyOrgId: row.agencyOrgId,
        agencyName: row.agencyName,
        ownBookings: row.agencyOrgId === target.coordinatorOrgId,
        monthlyShare: row.monthlyShare,
        updatedAt: row.updatedAt,
        changedBy: changedBy.get(row.id) ?? null,
      }),
    );
    const taken = new Set(shares.map((row) => row.agencyOrgId));
    const eligible = await tx
      .select({ id: organisation.id, name: organisation.name, parentOrgId: organisation.parentOrgId })
      .from(organisation)
      .where(and(eq(organisation.kind, "agency"), eq(organisation.status, "active")))
      .orderBy(asc(organisation.name));
    const options = eligible
      .filter((row) => (row.id === target.coordinatorOrgId || row.parentOrgId === target.coordinatorOrgId) && !taken.has(row.id))
      .map((row): AgencyOption => ({ id: row.id, name: row.name, ownBookings: row.id === target.coordinatorOrgId }));

    return {
      agreement: sideView(agreements, names),
      shares,
      summary: summariseShares(target.monthlyTarget, shares.map((row) => row.monthlyShare)),
      options,
    };
  });
}
