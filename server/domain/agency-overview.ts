import { and, asc, count, eq, gt, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { CampaignStatus } from "@/lib/domain/campaign-status";
import { tallyCampaigns, type CampaignCounts } from "@/lib/fynix/campaign-counts";
import { tallyAgencyLeads, type AgencyLeadFact, type AgencyLeadTally } from "@/lib/fynix/agency-leads";
import { campaign, campaignShare, invite, lead, member, organisation } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";
import { contactColumns, type OrganisationContact } from "@/server/domain/organisations";
import { readActivity, readPeople, type ActivityRow, type PersonRow } from "@/server/domain/people-overview";

/**
 * What the Fynix Agencies screen reads: a row per partner agency (an agency with a coordinator above it) and one agency in full. Both are Fynix reads,
 * open to staff. What counts as a lead, and in which month, is the one rule in lib/domain/counting-month.ts (`tallyAgencyLeads` applies it).
 */

const ORGANISATION_REF = /^ORG-[0-9A-HJKMNP-TV-Z]{4}$/;
const parent = alias(organisation, "coordinator_org");

export interface AgencyCoordinator {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: "active" | "archived";
}

export interface AgencyRow {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly contactEmail: string | null;
  readonly status: "active" | "archived";
  readonly createdAt: Date;
  readonly coordinator: AgencyCoordinator;
  readonly peopleCount: number;
  /** True when nobody has joined yet and an invite is still live. */
  readonly inviteWaiting: boolean;
  /** Campaigns the agency holds a share of, by what people say: active, closed, setting up. */
  readonly campaignCounts: CampaignCounts;
  readonly campaignCount: number;
  readonly submittedThisMonth: number;
  readonly acceptedThisMonth: number;
}

/** The leads each agency sent, as facts with their campaign's zone. Drafts are not leads yet, so they are left out. */
async function readLeadFacts(tx: ScopedTransaction, agencyIds: readonly string[]): Promise<Map<string, Map<string, AgencyLeadFact[]>>> {
  const byAgency = new Map<string, Map<string, AgencyLeadFact[]>>();
  if (agencyIds.length === 0) return byAgency;
  const rows = await tx
    .select({ agencyId: lead.sourceOrgId, campaignId: lead.campaignId, stage: lead.stage, meetingTime: lead.scheduledMeetingTime, submittedAt: lead.submittedAt, timeZone: campaign.timeZone })
    .from(lead)
    .innerJoin(campaign, eq(campaign.id, lead.campaignId))
    .where(and(inArray(lead.sourceOrgId, [...agencyIds]), eq(lead.released, true)));
  for (const row of rows) {
    const campaigns = byAgency.get(row.agencyId) ?? new Map<string, AgencyLeadFact[]>();
    campaigns.set(row.campaignId, [...(campaigns.get(row.campaignId) ?? []), { stage: row.stage, meetingTime: row.meetingTime, submittedAt: row.submittedAt, timeZone: row.timeZone }]);
    byAgency.set(row.agencyId, campaigns);
  }
  return byAgency;
}

const flat = (campaigns: Map<string, AgencyLeadFact[]> | undefined): AgencyLeadFact[] => [...(campaigns?.values() ?? [])].flat();

/** Every partner agency by name, archived ones included (their status says so), with its coordinator. */
export async function listAgencyRows(deps: DomainDeps, actor: FynixActor): Promise<readonly AgencyRow[]> {
  const now = deps.now();
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const agencies = await tx
      .select({
        id: organisation.id,
        publicRef: organisation.publicRef,
        name: organisation.name,
        contactEmail: organisation.contactEmail,
        status: organisation.status,
        createdAt: organisation.createdAt,
        coordinatorId: parent.id,
        coordinatorRef: parent.publicRef,
        coordinatorName: parent.name,
        coordinatorStatus: parent.status,
      })
      .from(organisation)
      .innerJoin(parent, eq(parent.id, organisation.parentOrgId))
      .where(eq(organisation.kind, "agency"))
      .orderBy(asc(organisation.name));
    const ids = agencies.map((row) => row.id);
    const people = new Map((await tx.select({ key: member.orgId, n: count() }).from(member).where(eq(member.orgKind, "agency")).groupBy(member.orgId)).map((row) => [row.key, row.n]));
    const waiting = new Map(
      (await tx.select({ key: invite.orgId, n: count() }).from(invite).where(and(isNull(invite.redeemedAt), isNull(invite.revokedAt), gt(invite.expiresAt, now))).groupBy(invite.orgId)).map((row) => [row.key, row.n]),
    );
    const shares = ids.length === 0 ? [] : await tx.select({ agencyId: campaignShare.agencyOrgId, status: campaign.status }).from(campaignShare).innerJoin(campaign, eq(campaign.id, campaignShare.campaignId)).where(inArray(campaignShare.agencyOrgId, ids));
    const facts = await readLeadFacts(tx, ids);
    return agencies.map((row): AgencyRow => {
      const statuses = shares.filter((share) => share.agencyId === row.id).map((share) => share.status);
      const tally = tallyAgencyLeads(flat(facts.get(row.id)), now);
      const own = people.get(row.id) ?? 0;
      return {
        id: row.id,
        publicRef: row.publicRef,
        name: row.name,
        contactEmail: row.contactEmail,
        status: row.status,
        createdAt: row.createdAt,
        coordinator: { id: row.coordinatorId, publicRef: row.coordinatorRef, name: row.coordinatorName, status: row.coordinatorStatus },
        peopleCount: own,
        inviteWaiting: own === 0 && (waiting.get(row.id) ?? 0) > 0,
        campaignCounts: tallyCampaigns(statuses),
        campaignCount: statuses.length,
        submittedThisMonth: tally.submittedThisMonth,
        acceptedThisMonth: tally.acceptedThisMonth,
      };
    });
  });
}

export interface AgencyCampaignRow {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: CampaignStatus;
  readonly clientName: string;
  /** The agency's share of the campaign per month. */
  readonly monthlyShare: number;
  /** Leads of this campaign the agency sent that count (accepted or a client no-show), in any month. */
  readonly delivered: number;
}

export interface AgencyDetail {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: "active" | "archived";
  readonly createdAt: Date;
  readonly timeZone: string | null;
  readonly contact: OrganisationContact;
  readonly coordinator: AgencyCoordinator;
  readonly people: readonly PersonRow[];
  readonly campaigns: readonly AgencyCampaignRow[];
  readonly campaignCounts: CampaignCounts;
  /** The agency's shares added up: how many campaigns, and the total it is asked for per month. */
  readonly shares: { readonly campaigns: number; readonly monthlyTotal: number };
  readonly tally: AgencyLeadTally;
  readonly activity: readonly ActivityRow[];
}

const clientOrg = alias(organisation, "client_org");

/** One partner agency by its public reference. An unknown reference, or one that is not a partner agency, is `not-found`. */
export async function readAgencyDetail(deps: DomainDeps, actor: FynixActor, publicRef: string): Promise<AgencyDetail> {
  if (!ORGANISATION_REF.test(publicRef)) throw new DomainError("not-found", "There is no such agency.");
  const now = deps.now();
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const [found] = await tx
      .select({
        id: organisation.id,
        publicRef: organisation.publicRef,
        name: organisation.name,
        status: organisation.status,
        createdAt: organisation.createdAt,
        timeZone: organisation.timeZone,
        ...contactColumns,
        coordinatorId: parent.id,
        coordinatorRef: parent.publicRef,
        coordinatorName: parent.name,
        coordinatorStatus: parent.status,
      })
      .from(organisation)
      .innerJoin(parent, eq(parent.id, organisation.parentOrgId))
      .where(and(eq(organisation.publicRef, publicRef), eq(organisation.kind, "agency")))
      .limit(1);
    if (found === undefined) throw new DomainError("not-found", "There is no such agency.");

    const shareRows = await tx
      .select({ id: campaign.id, publicRef: campaign.publicRef, name: campaign.name, status: campaign.status, clientName: clientOrg.name, monthlyShare: campaignShare.monthlyShare })
      .from(campaignShare)
      .innerJoin(campaign, eq(campaign.id, campaignShare.campaignId))
      .innerJoin(clientOrg, eq(clientOrg.id, campaign.clientOrgId))
      .where(eq(campaignShare.agencyOrgId, found.id))
      .orderBy(asc(campaign.name));
    const facts = (await readLeadFacts(tx, [found.id])).get(found.id);
    const campaigns = shareRows.map((row): AgencyCampaignRow => ({ ...row, delivered: tallyAgencyLeads(facts?.get(row.id) ?? [], now).delivered }));
    const people = await readPeople(tx, [{ id: found.id, name: found.name }], now);
    const activity = await readActivity(tx, [found.id, ...people.filter((person) => person.kind === "member").map((person) => person.id)], found.publicRef);
    return {
      id: found.id,
      publicRef: found.publicRef,
      name: found.name,
      status: found.status,
      createdAt: found.createdAt,
      timeZone: found.timeZone,
      contact: { contactName: found.contactName, contactEmail: found.contactEmail, contactPhone: found.contactPhone, website: found.website, address: found.address, notes: found.notes },
      coordinator: { id: found.coordinatorId, publicRef: found.coordinatorRef, name: found.coordinatorName, status: found.coordinatorStatus },
      people,
      campaigns,
      campaignCounts: tallyCampaigns(campaigns.map((row) => row.status)),
      shares: { campaigns: campaigns.length, monthlyTotal: campaigns.reduce((sum, row) => sum + row.monthlyShare, 0) },
      tally: tallyAgencyLeads(flat(facts), now),
      activity,
    };
  });
}
