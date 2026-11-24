import { sql } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import { campaign, campaignShare, lead } from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import { DomainError } from "@/server/domain/errors";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";

export interface ClientOverviewMetrics {
  readonly targetCount: number;
  readonly deliveredCount: number;
  readonly awaitingClientCount: number;
  readonly scheduledCount: number;
  readonly disputedCount: number;
}

export interface AgencyBreakdownItem {
  readonly agencyId: string;
  readonly agencyOrgId: string;
  readonly agencyName: string;
  readonly shareTarget: number;
  readonly deliveredCount: number;
  readonly awaitingClientCount: number;
  readonly overShareCount: number;
  readonly disputedCount: number;
}

export interface SupplierOverviewMetrics {
  readonly supplierTarget: number;
  readonly deliveredCount: number;
  readonly awaitingClientCount: number;
  readonly overShareCount: number;
  readonly disputedCount: number;
  readonly agencyBreakdown: readonly AgencyBreakdownItem[];
}

export interface AgencyOverviewMetrics {
  readonly agencyShareTarget: number;
  readonly deliveredCount: number;
  readonly awaitingClientCount: number;
  readonly overShareCount: number;
  readonly disputedCount: number;
}

export interface FynixOverviewMetrics {
  readonly totalCampaignsCount: number;
  readonly activeCampaignsCount: number;
  readonly totalTargetCount: number;
  readonly deliveredCount: number;
  readonly awaitingClientCount: number;
  readonly scheduledCount: number;
  readonly disputedCount: number;
  readonly overShareCount: number;
  readonly totalLeadsCount: number;
}

/**
 * Calculates overview metrics for a client organisation.
 */
export async function getClientOverviewMetrics(
  db: Database,
  actor: TenantActor,
): Promise<ClientOverviewMetrics> {
  if (actor.orgKind !== "client") {
    throw new DomainError("not-authorised", "Only client actors can retrieve client overview metrics.");
  }

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const campaigns = await tx
      .select({
        id: campaign.id,
        monthlyTarget: campaign.monthlyTarget,
        totalTarget: campaign.totalTarget,
        status: campaign.status,
      })
      .from(campaign);

    const targetCount = campaigns.reduce((sum, c) => sum + (c.monthlyTarget ?? 0), 0);

    const leads = await tx
      .select({
        id: lead.id,
        stage: lead.stage,
      })
      .from(lead);

    let deliveredCount = 0;
    let awaitingClientCount = 0;
    let scheduledCount = 0;
    let disputedCount = 0;

    for (const l of leads) {
      if (l.stage === "delivered") {
        deliveredCount++;
      } else if (l.stage === "awaiting_client") {
        awaitingClientCount++;
      } else if (l.stage === "scheduled") {
        scheduledCount++;
      } else if (l.stage === "disputed") {
        disputedCount++;
      }
    }

    return {
      targetCount,
      deliveredCount,
      awaitingClientCount,
      scheduledCount,
      disputedCount,
    };
  });
}

/**
 * Calculates overview metrics and agency breakdown for a supplier organisation.
 */
export async function getSupplierOverviewMetrics(
  db: Database,
  actor: TenantActor,
): Promise<SupplierOverviewMetrics> {
  if (actor.orgKind !== "agency") {
    throw new DomainError("not-authorised", "Only coordinator or agency actors can retrieve coordinator overview metrics.");
  }

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const campaigns = await tx
      .select({
        id: campaign.id,
        monthlyTarget: campaign.monthlyTarget,
        totalTarget: campaign.totalTarget,
        status: campaign.status,
      })
      .from(campaign);

    const supplierTarget = campaigns.reduce((sum, c) => sum + (c.monthlyTarget ?? 0), 0);

    const shares = await tx
      .select({
        id: campaignShare.id,
        campaignId: campaignShare.campaignId,
        agencyOrgId: campaignShare.agencyOrgId,
        monthlyShare: campaignShare.monthlyShare,
      })
      .from(campaignShare);

    const leads = await tx
      .select({
        id: lead.id,
        sourceOrgId: lead.sourceOrgId,
        stage: lead.stage,
        overShare: lead.overShare,
      })
      .from(lead);

    let deliveredCount = 0;
    let awaitingClientCount = 0;
    let overShareCount = 0;
    let disputedCount = 0;

    const agencyMap = new Map<
      string,
      {
        shareTarget: number;
        deliveredCount: number;
        awaitingClientCount: number;
        overShareCount: number;
        disputedCount: number;
      }
    >();

    for (const s of shares) {
      const existing = agencyMap.get(s.agencyOrgId) ?? {
        shareTarget: 0,
        deliveredCount: 0,
        awaitingClientCount: 0,
        overShareCount: 0,
        disputedCount: 0,
      };
      existing.shareTarget += s.monthlyShare;
      agencyMap.set(s.agencyOrgId, existing);
    }

    for (const l of leads) {
      if (l.stage === "delivered") {
        deliveredCount++;
      } else if (l.stage === "awaiting_client") {
        awaitingClientCount++;
      } else if (l.stage === "disputed") {
        disputedCount++;
      }

      if (l.overShare) {
        overShareCount++;
      }

      const existing = agencyMap.get(l.sourceOrgId) ?? {
        shareTarget: 0,
        deliveredCount: 0,
        awaitingClientCount: 0,
        overShareCount: 0,
        disputedCount: 0,
      };

      if (l.stage === "delivered") {
        existing.deliveredCount++;
      } else if (l.stage === "awaiting_client") {
        existing.awaitingClientCount++;
      } else if (l.stage === "disputed") {
        existing.disputedCount++;
      }

      if (l.overShare) {
        existing.overShareCount++;
      }

      agencyMap.set(l.sourceOrgId, existing);
    }

    // The names come from a database function: a supplier holds no grant on `organisation` (migration 0043).
    const partnerRows = await tx.execute<{ id: string; name: string }>(sql`select id, name from public.app_my_partner_agencies()`);
    const partnerNames = new Map(partnerRows.rows.map((row) => [row.id, row.name]));
    for (const partnerId of partnerNames.keys()) {
      if (!agencyMap.has(partnerId)) agencyMap.set(partnerId, { shareTarget: 0, deliveredCount: 0, awaitingClientCount: 0, overShareCount: 0, disputedCount: 0 });
    }

    const agencyBreakdown: AgencyBreakdownItem[] = Array.from(agencyMap.entries()).map(([orgId, data]) => ({
      agencyId: orgId,
      agencyOrgId: orgId,
      agencyName: orgId === actor.orgId ? "Direct Coordinator" : (partnerNames.get(orgId) ?? "Partner agency"),
      shareTarget: data.shareTarget,
      deliveredCount: data.deliveredCount,
      awaitingClientCount: data.awaitingClientCount,
      overShareCount: data.overShareCount,
      disputedCount: data.disputedCount,
    }));

    return {
      supplierTarget,
      deliveredCount,
      awaitingClientCount,
      overShareCount,
      disputedCount,
      agencyBreakdown,
    };
  });
}

/**
 * Calculates overview metrics for a partner agency organisation.
 */
export async function getAgencyOverviewMetrics(
  db: Database,
  actor: TenantActor,
): Promise<AgencyOverviewMetrics> {
  if (actor.orgKind !== "agency") {
    throw new DomainError("not-authorised", "Only agency actors can retrieve agency overview metrics.");
  }

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const shares = await tx
      .select({
        id: campaignShare.id,
        monthlyShare: campaignShare.monthlyShare,
        agencyOrgId: campaignShare.agencyOrgId,
      })
      .from(campaignShare);

    const agencyShareTarget = shares.reduce((sum, s) => sum + s.monthlyShare, 0);

    const leads = await tx
      .select({
        id: lead.id,
        sourceOrgId: lead.sourceOrgId,
        stage: lead.stage,
        overShare: lead.overShare,
      })
      .from(lead);

    let deliveredCount = 0;
    let awaitingClientCount = 0;
    let overShareCount = 0;
    let disputedCount = 0;

    for (const l of leads) {
      if (l.sourceOrgId !== actor.orgId) {
        continue;
      }

      if (l.stage === "delivered") {
        deliveredCount++;
      } else if (l.stage === "awaiting_client") {
        awaitingClientCount++;
      } else if (l.stage === "disputed") {
        disputedCount++;
      }

      if (l.overShare) {
        overShareCount++;
      }
    }

    return {
      agencyShareTarget,
      deliveredCount,
      awaitingClientCount,
      overShareCount,
      disputedCount,
    };
  });
}

/**
 * Calculates global KPIs across all clients and campaigns for Fynix operations.
 */
export async function getFynixOverviewMetrics(
  db: Database,
  actor: FynixActor,
): Promise<FynixOverviewMetrics> {
  return fynixRead(db, actor, async (tx) => {
    const campaigns = await tx
      .select({
        id: campaign.id,
        status: campaign.status,
        monthlyTarget: campaign.monthlyTarget,
        totalTarget: campaign.totalTarget,
      })
      .from(campaign);

    const leads = await tx
      .select({
        id: lead.id,
        stage: lead.stage,
        overShare: lead.overShare,
      })
      .from(lead);

    let deliveredCount = 0;
    let awaitingClientCount = 0;
    let scheduledCount = 0;
    let disputedCount = 0;
    let overShareCount = 0;

    for (const l of leads) {
      if (l.stage === "delivered") {
        deliveredCount++;
      } else if (l.stage === "awaiting_client") {
        awaitingClientCount++;
      } else if (l.stage === "scheduled") {
        scheduledCount++;
      } else if (l.stage === "disputed") {
        disputedCount++;
      }

      if (l.overShare) {
        overShareCount++;
      }
    }

    const activeCampaigns = campaigns.filter((c) => c.status === "active");
    const totalTargetCount = campaigns.reduce((sum, c) => sum + (c.monthlyTarget ?? 0), 0);

    return {
      totalCampaignsCount: campaigns.length,
      activeCampaignsCount: activeCampaigns.length,
      totalTargetCount,
      deliveredCount,
      awaitingClientCount,
      scheduledCount,
      disputedCount,
      overShareCount,
      totalLeadsCount: leads.length,
    };
  });
}
