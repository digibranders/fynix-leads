import {
  and,
  desc,
  eq,
  sql,
} from "drizzle-orm";
import { type LeadStage } from "@/lib/leads/stage";
import { agencyLeadColumns, clientLeadColumns } from "@/server/db/columns";
import type { Database } from "@/server/db/pool";
import {
  aliasIdentity,
  campaign,
  campaignHost,
  campaignShare,
  lead,
  leadHistory,
} from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import { DomainError } from "@/server/domain/errors";
import { type FynixActor } from "@/server/domain/fynix-write";
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

export function isDisputeWindowOpen(deliveredAt: Date | null, now: Date = new Date()): boolean {
  if (deliveredAt === null) return false;
  return now.getTime() - deliveredAt.getTime() <= 48 * 60 * 60 * 1000;
}

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

    const rows = await tx
      .select(clientLeadColumns)
      .from(lead)
      .innerJoin(campaign, eq(lead.campaignId, campaign.id))
      .where(and(...conditions))
      .orderBy(desc(lead.submittedAt));

    const now = new Date();
    return rows.map((r) => ({
      ...r,
      canDispute: r.stage === "delivered" && isDisputeWindowOpen(r.deliveredAt, now),
    }));
  });
}

/**
 * Lists leads for an agency organisation (source agency or supplier).
 */
export async function listAgencyLeads(
  db: Database,
  actor: { readonly userId: string; readonly orgId: string },
  filter?: { readonly stage?: LeadStage; readonly campaignId?: string },
) {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    // No source filter: the lead policy already limits an agency to its own leads, and a supplier to its own and those of the
    // partner agencies on its campaigns.
    const conditions = [];
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
    const supplierCampaigns = await tx
      .select({
        id: campaign.id,
        name: campaign.name,
        clientBrandName: campaign.clientBrandName,
      })
      .from(campaign)
      .where(and(eq(campaign.agencyOrgId, actor.orgId), eq(campaign.status, "active")));

    const shareCampaigns = await tx
      .select({
        id: campaign.id,
        name: campaign.name,
        clientBrandName: campaign.clientBrandName,
      })
      .from(campaign)
      .innerJoin(campaignShare, eq(campaign.id, campaignShare.campaignId))
      .where(and(eq(campaignShare.agencyOrgId, actor.orgId), eq(campaign.status, "active")));

    const campaignMap = new Map<string, { id: string; name: string; clientBrandName: string }>();
    for (const c of [...supplierCampaigns, ...shareCampaigns]) {
      campaignMap.set(c.id, c);
    }
    const campaigns = Array.from(campaignMap.values());

    const aliases = await tx
      .select({
        id: aliasIdentity.id,
        displayName: aliasIdentity.displayName,
        clientBrandName: aliasIdentity.clientBrandName,
        aliasEmail: aliasIdentity.aliasEmail,
      })
      .from(aliasIdentity)
      .where(and(sql`${aliasIdentity.verifiedAt} IS NOT NULL`, eq(aliasIdentity.status, "active")));

    const hosts = await tx
      .select({
        id: campaignHost.memberId,
        campaignId: campaignHost.campaignId,
        jobTitle: campaignHost.jobTitle,
      })
      .from(campaignHost)
      .where(eq(campaignHost.active, true));

    return {
      campaigns,
      aliases,
      hosts: hosts.map((h) => ({
        id: h.id,
        campaignId: h.campaignId,
        name: `Host (${h.jobTitle})`,
        jobTitle: h.jobTitle,
      })),
    };
  });
}

/**
 * Lists leads globally for Fynix operations with campaign details.
 */
export async function listFynixLeads(
  db: Database,
  _actor: FynixActor,
  filter?: { readonly campaignId?: string; readonly stage?: LeadStage },
) {
  const conditions = [];
  if (filter?.campaignId !== undefined) {
    conditions.push(eq(lead.campaignId, filter.campaignId));
  }
  if (filter?.stage !== undefined) {
    conditions.push(eq(lead.stage, filter.stage));
  }

  const rows = await db
    .select({
      id: lead.id,
      publicRef: lead.publicRef,
      campaignId: lead.campaignId,
      campaignName: campaign.name,
      clientBrandName: campaign.clientBrandName,
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
    })
    .from(lead)
    .innerJoin(campaign, eq(lead.campaignId, campaign.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(lead.submittedAt));

  return rows;
}


