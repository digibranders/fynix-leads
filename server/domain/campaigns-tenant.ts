import { asc, eq, sql } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import { agencyCampaignBriefColumns, clientCampaignBriefColumns } from "@/server/db/columns";
import { campaign, campaignShare, lead } from "@/server/db/schema";
import { isCountedStage } from "@/lib/domain/counting-month";
import { campaignBucket, notLiveReason, type CampaignBucket } from "@/lib/campaign-status";
import { withTenantScope } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import { DomainError } from "@/server/domain/errors";
import { campaignClientName } from "@/server/db/client-name";

/** One agency's line on a coordinator's campaign: the monthly share it holds and what it has delivered. */
export interface CampaignAgencyLine {
  readonly agencyOrgId: string;
  readonly name: string;
  readonly monthlyShare: number;
  readonly delivered: number;
}

/** What a campaign looks for and how to pitch it. The client wrote it with Fynix and reads it too (migration 0064); internal notes are never part of it. */
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
  /** What is taken when the campaign is set up (migrations 0083 and 0084): the pitch, the questions to ask a prospect and the two emails. */
  readonly pitchIntroduction: string;
  readonly pitchServices: string;
  readonly pitchDifferentiator: string;
  readonly pitchCollaterals: string;
  readonly pitchCaseStudies: string;
  readonly qualifyingQuestions: string;
  readonly firstEmail: string;
  readonly secondEmail: string;
}

export interface TenantCampaign {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly clientName: string;
  readonly status: "draft" | "active" | "paused" | "completed" | "archived";
  readonly startDate: string;
  readonly endDate: string;
  readonly monthlyTarget: number;
  readonly totalTarget: number;
  /** Leads the client has accepted and counted. */
  readonly delivered: number;
  /** Leads still moving: waiting on the client, booked, or awaiting an outcome. */
  readonly inProgress: number;
  /** What the viewer's own organisation carries each month (an agency, or a coordinator working alone); null for a client. */
  readonly share: number | null;
  /** A coordinator's partner agencies on this campaign. Empty for everyone else. */
  readonly agencies: readonly CampaignAgencyLine[];
  readonly brief: CampaignBrief;
}

const NO_BRIEF: CampaignBrief = { geography: "", industries: [], companySize: "", icp: "", jobTitles: [], seniority: "", technologies: [], bantBudget: "", bantAuthority: "", bantNeed: "", bantTimeline: "", instructions: "", pitchIntroduction: "", pitchServices: "", pitchDifferentiator: "", pitchCollaterals: "", pitchCaseStudies: "", qualifyingQuestions: "", firstEmail: "", secondEmail: "" };

const IN_PROGRESS = new Set(["awaiting_client", "scheduled", "outcome_due", "reschedule_needed", "held", "awaiting_decision"]);

/**
 * The campaigns the organisation can see, with how each is going. What is visible is the database's call (row-level security): a
 * client sees the campaigns it owns, a coordinator the ones it serves, a partner agency the ones shared with it. An agency counts only
 * the leads its own organisation submitted; a client and a coordinator count every lead on the campaign they can see.
 *
 * Only granted columns are used here: the brief (who to reach, qualification, instructions) is read by every tenant role, internal notes by none.
 */
export async function listTenantCampaigns(db: Database, actor: TenantActor, view: "client" | "coordinator" | "agency"): Promise<readonly TenantCampaign[]> {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const campaigns = await tx
      .select({
        id: campaign.id,
        publicRef: campaign.publicRef,
        name: campaign.name,
        clientName: campaignClientName(campaign.id),
        status: campaign.status,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        monthlyTarget: campaign.monthlyTarget,
        totalTarget: campaign.totalTarget,
      })
      .from(campaign)
      .orderBy(asc(campaign.name));
    if (campaigns.length === 0) return [];

    // The brief columns are granted to both tenant roles (migrations 0054 and 0064).
    const briefRows = await tx.select({ id: campaign.id, ...(view === "client" ? clientCampaignBriefColumns : agencyCampaignBriefColumns) }).from(campaign);
    const briefs = new Map<string, CampaignBrief>(briefRows.map(({ id, ...rest }) => [id, rest]));

    // A client may not know which organisation submitted a lead (no grant on the column), so it counts by stage alone.
    const leads: { campaignId: string; sourceOrgId: string | null; stage: string }[] =
      view === "client"
        ? (await tx.select({ campaignId: lead.campaignId, stage: lead.stage }).from(lead)).map((row) => ({ ...row, sourceOrgId: null }))
        : await tx.select({ campaignId: lead.campaignId, sourceOrgId: lead.sourceOrgId, stage: lead.stage }).from(lead);
    const shares = view === "client" ? [] : await tx.select({ campaignId: campaignShare.campaignId, agencyOrgId: campaignShare.agencyOrgId, monthlyShare: campaignShare.monthlyShare }).from(campaignShare);

    // Names of a coordinator's partner agencies come from a database function: a coordinator holds no grant on organisations.
    const names = new Map<string, string>();
    if (view === "coordinator") {
      const partners = await tx.execute<{ id: string; name: string }>(sql`select id, name from public.app_my_partner_agencies()`);
      for (const row of partners.rows) names.set(row.id, row.name);
    }

    return campaigns.map((row) => {
      const own = leads.filter((entry) => entry.campaignId === row.id && (view !== "agency" || entry.sourceOrgId === actor.orgId));
      const mine = shares.filter((share) => share.campaignId === row.id);
      return {
        ...row,
        delivered: own.filter((entry) => isCountedStage(entry.stage)).length,
        inProgress: own.filter((entry) => IN_PROGRESS.has(entry.stage)).length,
        share: view === "client" ? null : (mine.find((share) => share.agencyOrgId === actor.orgId)?.monthlyShare ?? null),
        brief: briefs.get(row.id) ?? NO_BRIEF,
        agencies:
          view === "coordinator"
            ? mine
                .filter((share) => share.agencyOrgId !== actor.orgId)
                .map((share) => ({
                  agencyOrgId: share.agencyOrgId,
                  name: names.get(share.agencyOrgId) ?? "Partner agency",
                  monthlyShare: share.monthlyShare,
                  delivered: leads.filter((entry) => entry.campaignId === row.id && entry.sourceOrgId === share.agencyOrgId && isCountedStage(entry.stage)).length,
                }))
            : [],
      };
    });
  });
}

/** The brief of one campaign the viewer sees: the client's read of its own campaign, and the coordinator's or agency's. `not-found` for any other. */
export async function readCampaignBrief(db: Database, actor: TenantActor, campaignId: string): Promise<CampaignBrief> {
  const columns = actor.orgKind === "client" ? clientCampaignBriefColumns : agencyCampaignBriefColumns;
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [row] = await tx.select(columns).from(campaign).where(eq(campaign.id, campaignId)).limit(1);
    if (row === undefined) throw new DomainError("not-found", "There is no such campaign.");
    return row;
  });
}

export interface CampaignReadiness {
  readonly campaignId: string;
  readonly name: string;
  readonly status: TenantCampaign["status"];
  readonly bucket: CampaignBucket;
  /** Why the campaign takes no leads yet, in words that name no person; null when it is active. The lead form shows "Not live yet: " and this. */
  readonly notLiveReason: string | null;
}

/**
 * For an agency or coordinator: each campaign it sees with whether it takes leads and, when it does not, why (the agreement is waiting for the
 * client or the coordinator, there is no host, Fynix has not switched it on, or it is closed). Read through `app_my_campaign_readiness`, which returns
 * flags only: an agency cannot read acceptances or other organisations' hosts.
 */
export async function listCampaignReadiness(db: Database, actor: TenantActor): Promise<readonly CampaignReadiness[]> {
  if (actor.orgKind !== "agency") throw new DomainError("not-authorised", "Only agency and coordinator members read campaign readiness.");
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const flags = await tx.execute<{ campaign_id: string; status: TenantCampaign["status"]; client_accepted: boolean; supplier_accepted: boolean; has_host: boolean }>(
      sql`select campaign_id, status, client_accepted, supplier_accepted, has_host from public.app_my_campaign_readiness()`,
    );
    const names = new Map((await tx.select({ id: campaign.id, name: campaign.name }).from(campaign)).map((row) => [row.id, row.name]));
    return flags.rows.map((row) => ({
      campaignId: row.campaign_id,
      name: names.get(row.campaign_id) ?? "Campaign",
      status: row.status,
      bucket: campaignBucket(row.status),
      // `agreed` is not returned: both flags true is the same fact.
      notLiveReason: notLiveReason({ status: row.status, agreed: row.client_accepted && row.supplier_accepted, clientAccepted: row.client_accepted, coordinatorAccepted: row.supplier_accepted, hasHost: row.has_host }),
    }));
  });
}
