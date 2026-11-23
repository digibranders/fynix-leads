import { and, asc, count, desc, eq, gt, inArray, notInArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { CampaignStatus } from "@/lib/domain/campaign-status";
import { summariseShares, type ShareSummary } from "@/lib/domain/share-allocation";
import type { HoursWindow } from "@/lib/domain/weekly-hours";
import { auditLog, campaign, campaignHost, campaignShare, hostBlock, hostHours, member, organisation } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";
import { readAgreements, type AgreementHistory, type AgreementParty } from "@/server/domain/agreements";
import { uuidSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";

/**
 * What the Fynix campaign screens read: the list, the header and brief, the hosts with their hours and blocks, and the
 * agreements with the shares. All Fynix reads, open to staff.
 */

const CAMPAIGN_REF = /^CMP-[0-9A-HJKMNP-TV-Z]{4}$/;

const client = alias(organisation, "client_org");
const supplier = alias(organisation, "supplier_org");

export interface CampaignRow {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: CampaignStatus;
  readonly clientName: string;
  readonly supplierName: string;
}

/** Every campaign, newest first. */
export async function listCampaignRows(deps: DomainDeps, actor: FynixActor): Promise<readonly CampaignRow[]> {
  return fynixRead(deps.fynixDb, actor, (tx) =>
    tx
      .select({ id: campaign.id, publicRef: campaign.publicRef, name: campaign.name, status: campaign.status, clientName: client.name, supplierName: supplier.name })
      .from(campaign)
      .innerJoin(client, eq(client.id, campaign.clientOrgId))
      .innerJoin(supplier, eq(supplier.id, campaign.agencyOrgId))
      .orderBy(desc(campaign.createdAt), asc(campaign.name)),
  );
}

export interface CampaignChoices {
  readonly clients: readonly { readonly id: string; readonly name: string }[];
  readonly suppliers: readonly { readonly id: string; readonly name: string }[];
}

/** The active clients and suppliers a new campaign can be made for. A partner agency is not a supplier, so it is left out. */
export async function listCampaignChoices(deps: DomainDeps, actor: FynixActor): Promise<CampaignChoices> {
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const rows = await tx.select({ id: organisation.id, name: organisation.name, kind: organisation.kind, parentOrgId: organisation.parentOrgId }).from(organisation).where(eq(organisation.status, "active")).orderBy(asc(organisation.name));
    return {
      clients: rows.filter((row) => row.kind === "client").map(({ id, name }) => ({ id, name })),
      suppliers: rows.filter((row) => row.kind === "agency" && row.parentOrgId === null).map(({ id, name }) => ({ id, name })),
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
  readonly internalNotes: string | null;
}

export interface CampaignHeader {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: CampaignStatus;
  readonly clientOrgId: string;
  readonly clientName: string;
  readonly supplierOrgId: string;
  readonly supplierName: string;
  readonly timeZone: string;
  readonly meetingMinutes: number;
  /** Hosts who are switched on. */
  readonly activeHostCount: number;
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
        supplierOrgId: campaign.agencyOrgId,
        supplierName: supplier.name,
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
        internalNotes: campaign.internalNotes,
      })
      .from(campaign)
      .innerJoin(client, eq(client.id, campaign.clientOrgId))
      .innerJoin(supplier, eq(supplier.id, campaign.agencyOrgId))
      .where(eq(campaign.publicRef, publicRef))
      .limit(1);
    if (row === undefined) throw new DomainError("not-found", "There is no such campaign.");
    const [hosts] = await tx.select({ n: count() }).from(campaignHost).where(and(eq(campaignHost.campaignId, row.id), eq(campaignHost.active, true)));
    const { id, publicRef: ref, name, status, clientOrgId, clientName, supplierOrgId, supplierName, timeZone, meetingMinutes, ...brief } = row;
    return { id, publicRef: ref, name, status, clientOrgId, clientName, supplierOrgId, supplierName, timeZone, meetingMinutes, activeHostCount: hosts?.n ?? 0, brief };
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
  readonly active: boolean;
  /** The zone the weekly hours are in, or `null` when no hours are set. */
  readonly timeZone: string | null;
  readonly hours: readonly HoursWindow[];
  /** Blocked times that have not ended yet, soonest first. */
  readonly blocks: readonly HostBlockView[];
}

export interface HostCandidate {
  readonly memberId: string;
  readonly displayName: string;
}

/**
 * A campaign's hosts, by name, each with the weekly hours and the blocked times still to come, plus the client's active people
 * who are not hosts yet (the ones Add host can offer).
 */
export async function listCampaignHosts(deps: DomainDeps, actor: FynixActor, campaignId: string): Promise<{ readonly hosts: readonly HostView[]; readonly candidates: readonly HostCandidate[] }> {
  const id = parseInput(uuidSchema, campaignId);
  const now = deps.now();
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const [target] = await tx.select({ id: campaign.id, clientOrgId: campaign.clientOrgId }).from(campaign).where(eq(campaign.id, id)).limit(1);
    if (target === undefined) throw new DomainError("not-found", "There is no such campaign.");
    const rows = await tx
      .select({ memberId: campaignHost.memberId, displayName: member.displayName, jobTitle: campaignHost.jobTitle, active: campaignHost.active })
      .from(campaignHost)
      .innerJoin(member, eq(member.id, campaignHost.memberId))
      .where(eq(campaignHost.campaignId, id))
      .orderBy(asc(member.displayName));
    const ids = rows.map((row) => row.memberId);
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
    const switchedOn = rows.filter((row) => row.active).map((row) => row.memberId);
    const candidates = await tx
      .select({ memberId: member.id, displayName: member.displayName })
      .from(member)
      .where(and(eq(member.orgId, target.clientOrgId), eq(member.orgKind, "client"), eq(member.status, "active"), ...(switchedOn.length === 0 ? [] : [notInArray(member.id, switchedOn)])))
      .orderBy(asc(member.displayName));
    return {
      hosts: rows.map(
        (row): HostView => {
          const own = hours.filter((entry) => entry.memberId === row.memberId);
          return {
            ...row,
            timeZone: own[0]?.timeZone ?? null,
            hours: own.map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute })),
            blocks: blocks.filter((entry) => entry.memberId === row.memberId).map(({ id: blockId, startsAt, endsAt, note }) => ({ id: blockId, startsAt, endsAt, note })),
          };
        },
      ),
      candidates,
    };
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
  /** Who accepted this version, first acceptance first. Empty while it waits. */
  readonly accepted: readonly { readonly name: string; readonly at: Date }[];
}

export interface AgreementSideView {
  readonly party: AgreementParty;
  readonly current: AgreementView | null;
  /** The version the current one replaced, with the day it was replaced. */
  readonly previous: { readonly version: number; readonly createdAt: Date; readonly supersededAt: Date } | null;
}

export interface ShareView {
  readonly agencyOrgId: string;
  readonly agencyName: string;
  /** True for the supplier's own bookings, false for a partner agency. */
  readonly ownBookings: boolean;
  readonly monthlyShare: number;
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
  readonly client: AgreementSideView;
  readonly supplier: AgreementSideView;
  readonly shares: readonly ShareView[];
  readonly summary: ShareSummary;
  /** Active agencies a share can still go to: the supplier and its partner agencies that have none yet. */
  readonly options: readonly AgencyOption[];
}

const sideView = (history: AgreementHistory, names: ReadonlyMap<string, string>): AgreementSideView => {
  const { current } = history;
  const previous = history.history[0];
  return {
    party: history.party,
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
            accepted: current.acceptances.map((entry) => ({ name: names.get(entry.userId) ?? "A signer", at: entry.acceptedAt })),
          },
    previous: previous === undefined || current === null ? null : { version: previous.version, createdAt: previous.createdAt, supersededAt: current.createdAt },
  };
};

/** Both agreements, the monthly shares with who last changed each, the over-allocation summary and the agencies still without a share. */
export async function readAgreementsPage(deps: DomainDeps, actor: FynixActor, campaignId: string): Promise<AgreementsPage> {
  const id = parseInput(uuidSchema, campaignId);
  const agreements = await readAgreements(deps, actor, id);
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const [target] = await tx.select({ id: campaign.id, supplierOrgId: campaign.agencyOrgId }).from(campaign).where(eq(campaign.id, id)).limit(1);
    if (target === undefined) throw new DomainError("not-found", "There is no such campaign.");

    const signerIds = [...agreements.client.current?.acceptances ?? [], ...agreements.supplier.current?.acceptances ?? []].map((entry) => entry.userId);
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

    const shares = shareRows.map(
      (row): ShareView => ({
        agencyOrgId: row.agencyOrgId,
        agencyName: row.agencyName,
        ownBookings: row.agencyOrgId === target.supplierOrgId,
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
      .filter((row) => (row.id === target.supplierOrgId || row.parentOrgId === target.supplierOrgId) && !taken.has(row.id))
      .map((row): AgencyOption => ({ id: row.id, name: row.name, ownBookings: row.id === target.supplierOrgId }));

    return {
      client: sideView(agreements.client, names),
      supplier: sideView(agreements.supplier, names),
      shares,
      summary: summariseShares(agreements.supplier.current?.monthlyTarget ?? null, shares.map((row) => row.monthlyShare)),
      options,
    };
  });
}
