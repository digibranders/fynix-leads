import { asc, sql } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import { campaign, campaignShare, lead } from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";

/** One agency's line on a supplier's campaign: the monthly share it holds and what it has delivered. */
export interface CampaignAgencyLine {
  readonly agencyOrgId: string;
  readonly name: string;
  readonly monthlyShare: number;
  readonly delivered: number;
}

/** What a campaign looks for and how to pitch it. Suppliers and agencies read it; a client does not need it here. */
export interface CampaignBrief {
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
}

export interface TenantCampaign {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly clientBrandName: string;
  readonly status: "draft" | "active" | "paused" | "completed" | "archived";
  readonly startDate: string;
  readonly endDate: string;
  readonly monthlyTarget: number;
  readonly totalTarget: number;
  /** Leads the client has accepted and counted. */
  readonly delivered: number;
  /** Leads still moving: waiting on the client, booked, or awaiting an outcome. */
  readonly inProgress: number;
  /** What the viewer's own organisation carries each month (an agency, or a supplier working alone); null for a client. */
  readonly share: number | null;
  /** A supplier's partner agencies on this campaign. Empty for everyone else. */
  readonly agencies: readonly CampaignAgencyLine[];
  /** The brief, for a supplier or agency; null for a client. */
  readonly brief: CampaignBrief | null;
}

const NO_BRIEF: CampaignBrief = { geography: "", industries: [], companySize: "", icp: "", jobTitles: [], seniority: "", technologies: [], bantBudget: "", bantAuthority: "", bantNeed: "", bantTimeline: "", instructions: "" };

const IN_PROGRESS = new Set(["awaiting_client", "scheduled", "outcome_due", "reschedule_needed", "held"]);

/**
 * The campaigns the organisation can see, with how each is going. What is visible is the database's call (row-level security): a
 * client sees the campaigns it owns, a supplier the ones it serves, a partner agency the ones shared with it. An agency counts only
 * the leads its own organisation submitted; a client and a supplier count every lead on the campaign they can see.
 *
 * Only the columns every tenant role may read are used here: the brief (who to reach, qualification) is not granted to tenants yet.
 */
export async function listTenantCampaigns(db: Database, actor: TenantActor, view: "client" | "supplier" | "agency"): Promise<readonly TenantCampaign[]> {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const campaigns = await tx
      .select({
        id: campaign.id,
        publicRef: campaign.publicRef,
        name: campaign.name,
        clientBrandName: campaign.clientBrandName,
        status: campaign.status,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        monthlyTarget: campaign.monthlyTarget,
        totalTarget: campaign.totalTarget,
      })
      .from(campaign)
      .orderBy(asc(campaign.name));
    if (campaigns.length === 0) return [];

    // The brief columns are granted to the agency role only (migration 0054), so a client never selects them.
    const briefRows =
      view === "client"
        ? []
        : await tx
            .select({
              id: campaign.id,
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
            })
            .from(campaign);
    const briefs = new Map<string, CampaignBrief>(briefRows.map(({ id, ...rest }) => [id, rest]));

    // A client may not know which organisation submitted a lead (no grant on the column), so it counts by stage alone.
    const leads: { campaignId: string; sourceOrgId: string | null; stage: string }[] =
      view === "client"
        ? (await tx.select({ campaignId: lead.campaignId, stage: lead.stage }).from(lead)).map((row) => ({ ...row, sourceOrgId: null }))
        : await tx.select({ campaignId: lead.campaignId, sourceOrgId: lead.sourceOrgId, stage: lead.stage }).from(lead);
    const shares = view === "client" ? [] : await tx.select({ campaignId: campaignShare.campaignId, agencyOrgId: campaignShare.agencyOrgId, monthlyShare: campaignShare.monthlyShare }).from(campaignShare);

    // Names of a supplier's partner agencies come from a database function: a supplier holds no grant on organisations.
    const names = new Map<string, string>();
    if (view === "supplier") {
      const partners = await tx.execute<{ id: string; name: string }>(sql`select id, name from public.app_my_partner_agencies()`);
      for (const row of partners.rows) names.set(row.id, row.name);
    }

    return campaigns.map((row) => {
      const own = leads.filter((entry) => entry.campaignId === row.id && (view !== "agency" || entry.sourceOrgId === actor.orgId));
      const mine = shares.filter((share) => share.campaignId === row.id);
      return {
        ...row,
        delivered: own.filter((entry) => entry.stage === "delivered").length,
        inProgress: own.filter((entry) => IN_PROGRESS.has(entry.stage)).length,
        share: view === "client" ? null : (mine.find((share) => share.agencyOrgId === actor.orgId)?.monthlyShare ?? null),
        brief: view === "client" ? null : (briefs.get(row.id) ?? NO_BRIEF),
        agencies:
          view === "supplier"
            ? mine
                .filter((share) => share.agencyOrgId !== actor.orgId)
                .map((share) => ({
                  agencyOrgId: share.agencyOrgId,
                  name: names.get(share.agencyOrgId) ?? "Partner agency",
                  monthlyShare: share.monthlyShare,
                  delivered: leads.filter((entry) => entry.campaignId === row.id && entry.sourceOrgId === share.agencyOrgId && entry.stage === "delivered").length,
                }))
            : [],
      };
    });
  });
}
