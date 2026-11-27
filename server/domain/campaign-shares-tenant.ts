import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import { campaign, campaignShare } from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import { assertCampaignOpen, requireOpenCampaign } from "@/server/domain/campaign-rules";
import { DomainError } from "@/server/domain/errors";
import { notify } from "@/server/domain/notices";
import { removeCampaignShareSchema, setCampaignShareSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";

/**
 * A coordinator splits a campaign Fynix gave it between itself and its partner agencies. The database decides who may: row-level
 * security lets only a manager of the campaign's coordinator write a share, and a trigger (migration 0024) refuses an agency that is
 * neither the coordinator nor one of its partners. Here the refusals are put into plain words.
 */
export interface AssignableAgency {
  readonly id: string;
  readonly name: string;
}

function refusal(error: unknown): never {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  const message = cause instanceof Error ? cause.message : "";
  if (/row-level security/.test(message)) throw new DomainError("not-authorised", "Only a manager of your account can assign a campaign to an agency.");
  if (/campaign_share_agency_not_in_supplier_tree/.test(message)) throw new DomainError("share-not-allowed", "A campaign can be assigned to you or to one of your partner agencies.");
  throw error;
}

/** The agencies a coordinator may assign a campaign to: its active partner agencies. */
export async function listAssignableAgencies(db: Database, actor: TenantActor): Promise<readonly AssignableAgency[]> {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const result = await tx.execute<{ id: string; name: string; status: string }>(sql`select id, name, status from public.app_my_partner_agencies() order by name`);
    return result.rows.filter((row) => row.status === "active").map((row) => ({ id: row.id, name: row.name }));
  });
}

/** Sets an agency's monthly share of a campaign: assigns it, or changes the share it already holds. */
export async function assignCampaignShare(db: Database, actor: TenantActor, input: unknown): Promise<void> {
  const parsed = parseInput(setCampaignShareSchema, input);
  try {
    await withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
      const [target] = await tx.select({ status: campaign.status }).from(campaign).where(eq(campaign.id, parsed.campaignId)).limit(1);
      if (target === undefined) throw new DomainError("not-found", "There is no such campaign.");
      assertCampaignOpen(target.status);
      const [existing] = await tx
        .select({ id: campaignShare.id })
        .from(campaignShare)
        .where(and(eq(campaignShare.campaignId, parsed.campaignId), eq(campaignShare.agencyOrgId, parsed.agencyOrgId)))
        .limit(1);
      if (existing === undefined) {
        await tx.insert(campaignShare).values({ campaignId: parsed.campaignId, agencyOrgId: parsed.agencyOrgId, monthlyShare: parsed.monthlyShare });
        await notify(tx, { type: "campaign_shared", campaignId: parsed.campaignId, agencyOrgId: parsed.agencyOrgId });
      } else {
        await tx.update(campaignShare).set({ monthlyShare: parsed.monthlyShare, updatedAt: new Date() }).where(eq(campaignShare.id, existing.id));
      }
    });
  } catch (error) {
    refusal(error);
  }
}

/** Takes a campaign back from an agency. */
export async function unassignCampaignShare(db: Database, actor: TenantActor, input: unknown): Promise<void> {
  const parsed = parseInput(removeCampaignShareSchema, input);
  try {
    await withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
      await requireOpenCampaign(tx, parsed.campaignId);
      const removed = await tx
        .delete(campaignShare)
        .where(and(eq(campaignShare.campaignId, parsed.campaignId), eq(campaignShare.agencyOrgId, parsed.agencyOrgId)))
        .returning({ id: campaignShare.id });
      if (removed.length === 0) throw new DomainError("not-found", "That agency does not hold this campaign.");
      await notify(tx, { type: "campaign_unshared", campaignId: parsed.campaignId, agencyOrgId: parsed.agencyOrgId });
    });
  } catch (error) {
    refusal(error);
  }
}
