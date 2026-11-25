import { asc, eq, sql } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import { campaign, campaignShare } from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";

export interface PartnerAgencyRow {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: string;
  /** The monthly share each campaign gives this agency. */
  readonly shares: readonly { readonly campaignName: string; readonly monthlyShare: number }[];
}

/**
 * The partner agencies of the coordinator, with the monthly share of each campaign they hold. The names come from a database function
 * (migration 0043), since a coordinator holds no grant on organisations; the shares are the coordinator's own through row-level security.
 */
export async function listPartnerAgencies(db: Database, actor: { readonly userId: string; readonly orgId: string }): Promise<readonly PartnerAgencyRow[]> {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const partners = await tx.execute<{ id: string; public_ref: string; name: string; status: string }>(sql`select id, public_ref, name, status from public.app_my_partner_agencies()`);
    const shares = await tx
      .select({ agencyOrgId: campaignShare.agencyOrgId, monthlyShare: campaignShare.monthlyShare, campaignName: campaign.name })
      .from(campaignShare)
      .innerJoin(campaign, eq(campaign.id, campaignShare.campaignId))
      .orderBy(asc(campaign.name));
    return partners.rows.map((row) => ({
      id: row.id,
      publicRef: row.public_ref,
      name: row.name,
      status: row.status,
      shares: shares.filter((share) => share.agencyOrgId === row.id).map(({ campaignName, monthlyShare }) => ({ campaignName, monthlyShare })),
    }));
  });
}
