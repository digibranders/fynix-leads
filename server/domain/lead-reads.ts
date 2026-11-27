import { checklistFor, type QualificationCheck } from "@/lib/qualification-checks";
import {
  and,
  desc,
  eq,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { type LeadStage } from "@/lib/leads/stage";
import { agencyLeadColumns, clientLeadColumns } from "@/server/db/columns";
import type { Database } from "@/server/db/pool";
import {
  aliasIdentity,
  campaign,
  campaignShare,
  lead,
  leadHistory,
  member,
  organisation,
} from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import { DomainError } from "@/server/domain/errors";
import { type FynixActor } from "@/server/domain/fynix-write";
import { listCampaignTeam } from "@/server/domain/host-availability";
import { campaignClientName, clientNameOf } from "@/server/db/client-name";
export interface LeadHistoryRecord {
  readonly id: string;
  readonly leadId: string;
  readonly actorUserId: string;
  readonly actorRole: string;
  readonly action: string;
  readonly fromStage: string | null;
  readonly toStage: string | null;
  readonly note: string | null;
  readonly snapshot: unknown;
  readonly createdAt: Date;
}

export const leadHistoryColumns = {
  id: leadHistory.id,
  leadId: leadHistory.leadId,
  actorUserId: leadHistory.actorUserId,
  actorRole: leadHistory.actorRole,
  action: leadHistory.action,
  fromStage: leadHistory.fromStage,
  toStage: leadHistory.toStage,
  note: leadHistory.note,
  snapshot: leadHistory.snapshot,
  createdAt: leadHistory.createdAt,
};

/**
 * Lists leads for a client organisation.
 */
export async function listClientLeads(
  db: Database,
  actor: { readonly userId: string; readonly orgId: string },
  filter?: { readonly stage?: LeadStage; readonly campaignId?: string },
) {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const conditions = [eq(campaign.clientOrgId, actor.orgId)];
    if (filter?.stage !== undefined) {
      conditions.push(eq(lead.stage, filter.stage));
    }
    if (filter?.campaignId !== undefined) {
      conditions.push(eq(lead.campaignId, filter.campaignId));
    }

    // The host's name is the client's own person: the member row is readable to the client.
    return tx
      .select({ ...clientLeadColumns, hostName: member.displayName })
      .from(lead)
      .innerJoin(campaign, eq(lead.campaignId, campaign.id))
      .leftJoin(member, eq(member.id, lead.hostMemberId))
      .where(and(...conditions))
      .orderBy(desc(lead.submittedAt));
  });
}

/**
 * Lists leads for an agency organisation (source agency or coordinator). Drafts, and drafts that were discarded, are left out: they are not leads yet
 * (`listAgencyDrafts` reads them), so the tables, the stage bar and the overviews never count them.
 */
export async function listAgencyLeads(
  db: Database,
  actor: { readonly userId: string; readonly orgId: string },
  filter?: { readonly stage?: LeadStage; readonly campaignId?: string },
) {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    // No source filter: the lead policy already limits an agency to its own leads, and a coordinator to its own and those of the
    // partner agencies on its campaigns.
    const conditions = [eq(lead.released, true)];
    if (filter?.stage !== undefined) {
      conditions.push(eq(lead.stage, filter.stage));
    }
    if (filter?.campaignId !== undefined) {
      conditions.push(eq(lead.campaignId, filter.campaignId));
    }

    const rows = await tx
      .select(agencyLeadColumns)
      .from(lead)
      .where(and(...conditions))
      .orderBy(desc(lead.submittedAt));

    return rows;
  });
}

/** The drafts of the caller's own organisation, newest edit first. Never another organisation's, and never a discarded one. */
export async function listAgencyDrafts(db: Database, actor: { readonly userId: string; readonly orgId: string }) {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) =>
    tx
      .select(agencyLeadColumns)
      .from(lead)
      .where(and(eq(lead.stage, "draft"), eq(lead.sourceOrgId, actor.orgId)))
      .orderBy(desc(lead.updatedAt)),
  );
}

/** One draft of the caller's own organisation by its reference, for the lead form to continue. `not-found` for anything else, including a lead that was sent. */
export async function getOwnDraft(db: Database, actor: { readonly userId: string; readonly orgId: string }, publicRef: string) {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [row] = await tx
      .select(agencyLeadColumns)
      .from(lead)
      .where(and(eq(lead.publicRef, publicRef), eq(lead.sourceOrgId, actor.orgId), eq(lead.stage, "draft")))
      .limit(1);
    if (row === undefined) throw new DomainError("not-found", "There is no such draft.");
    return row;
  });
}

/**
 * Retrieves lead details and history for client.
 */
export async function getLeadDetailsForClient(
  db: Database,
  actor: { readonly userId: string; readonly orgId: string },
  leadPublicRef: string,
) {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [leadRecord] = await tx
      .select(clientLeadColumns)
      .from(lead)
      .innerJoin(campaign, eq(lead.campaignId, campaign.id))
      .where(and(eq(lead.publicRef, leadPublicRef), eq(campaign.clientOrgId, actor.orgId)))
      .limit(1);

    if (leadRecord === undefined) {
      throw new DomainError("not-found", "There is no such lead.");
    }

    const historyRows = await tx
      .select(leadHistoryColumns)
      .from(leadHistory)
      .where(eq(leadHistory.leadId, leadRecord.id))
      .orderBy(desc(leadHistory.createdAt));

    return {
      lead: leadRecord,
      history: historyRows,
    };
  });
}

/**
 * Retrieves lead details and history for agency.
 */
export async function getLeadDetailsForAgency(
  db: Database,
  actor: { readonly userId: string; readonly orgId: string },
  leadPublicRef: string,
) {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [leadRecord] = await tx
      .select(agencyLeadColumns)
      .from(lead)
      .where(and(eq(lead.publicRef, leadPublicRef), eq(lead.sourceOrgId, actor.orgId)))
      .limit(1);

    if (leadRecord === undefined) {
      throw new DomainError("not-found", "There is no such lead.");
    }

    const historyRows = await tx
      .select(leadHistoryColumns)
      .from(leadHistory)
      .where(eq(leadHistory.leadId, leadRecord.id))
      .orderBy(desc(leadHistory.createdAt));

    return {
      lead: leadRecord,
      history: historyRows,
    };
  });
}

/**
 * Options for submitting a lead: campaigns assigned, verified aliases, active hosts.
 */
export async function getLeadSubmissionOptions(
  db: Database,
  actor: TenantActor,
) {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const coordinatorCampaigns = await tx
      .select({
        id: campaign.id,
        name: campaign.name,
        clientOrgId: campaign.clientOrgId,
        clientName: campaignClientName(campaign.id),
        jobTitles: campaign.jobTitles,
        industries: campaign.industries,
        geography: campaign.geography,
        qualifyingQuestions: campaign.qualifyingQuestions,
        qualifyingItems: campaign.qualifyingItems,
      })
      .from(campaign)
      .where(and(eq(campaign.agencyOrgId, actor.orgId), eq(campaign.status, "active")));

    const shareCampaigns = await tx
      .select({
        id: campaign.id,
        name: campaign.name,
        clientOrgId: campaign.clientOrgId,
        clientName: campaignClientName(campaign.id),
        jobTitles: campaign.jobTitles,
        industries: campaign.industries,
        geography: campaign.geography,
        qualifyingQuestions: campaign.qualifyingQuestions,
        qualifyingItems: campaign.qualifyingItems,
      })
      .from(campaign)
      .innerJoin(campaignShare, eq(campaign.id, campaignShare.campaignId))
      .where(and(eq(campaignShare.agencyOrgId, actor.orgId), eq(campaign.status, "active")));

    // Each campaign brings the checklist its qualification criteria and qualifying questions make, for the lead form to tick.
    const campaignMap = new Map<string, { id: string; name: string; clientOrgId: string; clientName: string; checklist: QualificationCheck[] }>();
    for (const { jobTitles, industries, geography, qualifyingQuestions, qualifyingItems, ...c } of [...coordinatorCampaigns, ...shareCampaigns]) {
      campaignMap.set(c.id, { ...c, checklist: checklistFor({ jobTitles, industries, geography, qualifyingQuestions, qualifyingItems }) });
    }
    const campaigns = Array.from(campaignMap.values());

    const aliases = await tx
      .select({
        id: aliasIdentity.id,
        displayName: aliasIdentity.displayName,
        clientOrgId: aliasIdentity.clientOrgId,
        clientName: clientNameOf(aliasIdentity.clientOrgId),
        aliasEmail: aliasIdentity.aliasEmail,
      })
      .from(aliasIdentity)
      .where(and(sql`${aliasIdentity.verifiedAt} IS NOT NULL`, eq(aliasIdentity.status, "active")));

    // The supply side sees the name of each person of the client's team and nothing else (owner decision, 2026-11-26), through a function that answers for the campaigns it serves.
    const hosts: { id: string; campaignId: string; name: string }[] = [];
    for (const row of campaigns) {
      for (const choice of await listCampaignTeam(tx, row.id)) hosts.push({ id: choice.memberId, campaignId: row.id, name: choice.displayName });
    }

    return {
      campaigns,
      aliases,
      hosts,
    };
  });
}

/**
 * Lists leads globally for Fynix operations with campaign details.
 */
export async function listFynixLeads(
  db: Database,
  _actor: FynixActor,
  filter?: { readonly campaignId?: string; readonly stage?: LeadStage; /** The coordinator or agency that sent the lead. */ readonly sourceOrgId?: string },
) {
  // A draft belongs to the agency until it is sent, so it is not listed as a lead.
  const conditions = [eq(lead.released, true)];
  if (filter?.campaignId !== undefined) {
    conditions.push(eq(lead.campaignId, filter.campaignId));
  }
  if (filter?.stage !== undefined) {
    conditions.push(eq(lead.stage, filter.stage));
  }
  if (filter?.sourceOrgId !== undefined) {
    conditions.push(eq(lead.sourceOrgId, filter.sourceOrgId));
  }
  const sourceOrg = alias(organisation, "source_org");

  const rows = await db
    .select({
      id: lead.id,
      publicRef: lead.publicRef,
      campaignId: lead.campaignId,
      campaignName: campaign.name,
      clientName: campaignClientName(campaign.id),
      prospectName: lead.prospectName,
      prospectTitle: lead.prospectTitle,
      prospectCompany: lead.prospectCompany,
      prospectDomain: lead.prospectDomain,
      prospectEmail: lead.prospectEmail,
      stage: lead.stage,
      scheduledMeetingTime: lead.scheduledMeetingTime,
      overShare: lead.overShare,
      duplicateOverride: lead.duplicateOverride,
      submittedAt: lead.submittedAt,
      hostName: member.displayName,
      sourceName: sourceOrg.name,
    })
    .from(lead)
    .innerJoin(campaign, eq(lead.campaignId, campaign.id))
    .innerJoin(sourceOrg, eq(sourceOrg.id, lead.sourceOrgId))
    .leftJoin(member, eq(member.id, lead.hostMemberId))
    .where(and(...conditions))
    .orderBy(desc(lead.submittedAt));

  return rows;
}


