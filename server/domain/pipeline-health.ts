import { eq, inArray } from "drizzle-orm";
import { countedMonth, isCountedStage } from "@/lib/domain/counting-month";
import { monthInZone } from "@/lib/time/zones";
import { campaign, campaignShare, lead, organisation } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";

/** How long after its start a booked meeting counts as overdue for an outcome (the meeting length is 30 minutes unless set; the outcome is due once it is over). */
const OVERDUE_AFTER_MINUTES = 30;
const HOUR = 3_600_000;

export interface CampaignPipelineHealth {
  readonly campaignId: string;
  readonly campaignName: string;
  readonly clientName: string;
  /** "YYYY-MM" in the campaign's time zone: the month the figures are for. */
  readonly month: string;
  readonly target: number;
  readonly delivered: number;
  /** Delivered against each organisation that sent leads or holds a share, the coordinator included. */
  readonly byAgency: readonly { readonly agencyOrgId: string; readonly agencyName: string; readonly share: number; readonly delivered: number }[];
}

export interface WaitingLead {
  readonly leadId: string;
  readonly leadRef: string;
  readonly campaignName: string;
  readonly waitingHours: number;
}

export interface OverdueOutcome {
  readonly leadId: string;
  readonly leadRef: string;
  readonly campaignName: string;
  readonly meetingTime: Date;
  readonly overdueHours: number;
}

export interface PipelineHealth {
  readonly campaigns: readonly CampaignPipelineHealth[];
  /** The lead that has waited longest for the client to pick a time, across active campaigns. Null when none waits. */
  readonly oldestWaiting: WaitingLead | null;
  /** Booked meetings that are over and have no outcome, oldest first. */
  readonly overdueOutcomes: readonly OverdueOutcome[];
}

/**
 * What Fynix's overview needs to see where a month is going: per active campaign the number delivered against the one target, split by the organisation that
 * sent the leads; the lead that has waited longest for a time; and the meetings whose outcome is overdue. A lead counts in the month its meeting was held,
 * read in the campaign's time zone (`countedMonth`). Open to staff.
 */
export async function readFynixPipelineHealth(deps: DomainDeps, actor: FynixActor, now: Date = deps.now()): Promise<PipelineHealth> {
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const campaigns = await tx
      .select({ id: campaign.id, name: campaign.name, clientName: organisation.name, target: campaign.monthlyTarget, timeZone: campaign.timeZone, agencyOrgId: campaign.agencyOrgId })
      .from(campaign)
      .innerJoin(organisation, eq(organisation.id, campaign.clientOrgId))
      .where(eq(campaign.status, "active"));
    const ids = campaigns.map((row) => row.id);
    if (ids.length === 0) return { campaigns: [], oldestWaiting: null, overdueOutcomes: [] };

    const leads = await tx
      .select({ id: lead.id, publicRef: lead.publicRef, campaignId: lead.campaignId, sourceOrgId: lead.sourceOrgId, stage: lead.stage, meetingTime: lead.scheduledMeetingTime, submittedAt: lead.submittedAt })
      .from(lead)
      .where(inArray(lead.campaignId, ids));
    const shares = await tx.select({ campaignId: campaignShare.campaignId, agencyOrgId: campaignShare.agencyOrgId, monthlyShare: campaignShare.monthlyShare }).from(campaignShare).where(inArray(campaignShare.campaignId, ids));
    const orgIds = [...new Set([...leads.map((row) => row.sourceOrgId), ...shares.map((row) => row.agencyOrgId), ...campaigns.map((row) => row.agencyOrgId)])];
    const names = new Map((await tx.select({ id: organisation.id, name: organisation.name }).from(organisation).where(inArray(organisation.id, orgIds))).map((row) => [row.id, row.name]));
    const nameOf = new Map(campaigns.map((row) => [row.id, row.name]));

    const health: CampaignPipelineHealth[] = campaigns.map((row) => {
      const month = monthInZone(now, row.timeZone);
      const counted = leads.filter((entry) => entry.campaignId === row.id && isCountedStage(entry.stage) && entry.meetingTime !== null && countedMonth(entry.meetingTime, row.timeZone) === month);
      const holders = new Set([...shares.filter((share) => share.campaignId === row.id).map((share) => share.agencyOrgId), ...counted.map((entry) => entry.sourceOrgId)]);
      return {
        campaignId: row.id,
        campaignName: row.name,
        clientName: row.clientName,
        month,
        target: row.target,
        delivered: counted.length,
        byAgency: [...holders]
          .map((agencyOrgId) => ({
            agencyOrgId,
            agencyName: names.get(agencyOrgId) ?? "Agency",
            share: shares.find((share) => share.campaignId === row.id && share.agencyOrgId === agencyOrgId)?.monthlyShare ?? 0,
            delivered: counted.filter((entry) => entry.sourceOrgId === agencyOrgId).length,
          }))
          .sort((a, b) => a.agencyName.localeCompare(b.agencyName)),
      };
    });

    const waiting = leads.filter((entry) => entry.stage === "awaiting_client").sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime())[0];
    const overdue = leads
      .flatMap((entry) => {
        const due = entry.meetingTime === null ? null : entry.meetingTime.getTime() + OVERDUE_AFTER_MINUTES * 60_000;
        if (entry.stage !== "scheduled" || entry.meetingTime === null || due === null || due > now.getTime()) return [];
        return [{ leadId: entry.id, leadRef: entry.publicRef, campaignName: nameOf.get(entry.campaignId) ?? "", meetingTime: entry.meetingTime, overdueHours: Math.floor((now.getTime() - due) / HOUR) }];
      })
      .sort((a, b) => a.meetingTime.getTime() - b.meetingTime.getTime());

    return {
      campaigns: health,
      oldestWaiting: waiting === undefined ? null : { leadId: waiting.id, leadRef: waiting.publicRef, campaignName: nameOf.get(waiting.campaignId) ?? "", waitingHours: Math.floor((now.getTime() - waiting.submittedAt.getTime()) / HOUR) },
      overdueOutcomes: overdue,
    };
  });
}
