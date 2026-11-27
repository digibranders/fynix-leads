import type { QualificationCheck } from "@/lib/qualification-checks";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { CampaignStatus } from "@/lib/domain/campaign-status";
import { clientLeadColumns } from "@/server/db/columns";
import type { Database } from "@/server/db/pool";
import { campaign, hostHours, lead, member } from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import { DomainError } from "@/server/domain/errors";

/** A lead waiting for the client to pick a time: everything the Availability screen shows about it. */
export interface AvailabilityItem {
  readonly id: string;
  readonly publicRef: string;
  readonly prospectName: string;
  readonly prospectTitle: string;
  readonly prospectCompany: string;
  readonly prospectDomain: string;
  readonly prospectNotes: string | null;
  readonly bant: { readonly budget: string; readonly authority: string; readonly need: string; readonly timeline: string };
  /** The checklist the agency ticked when it sent the lead, and its note. */
  readonly qualification: { readonly checks: readonly QualificationCheck[]; readonly notes: string };
  readonly proposedTimes: readonly string[];
  readonly submittedAt: Date;
  readonly campaignName: string;
  readonly campaignStatus: CampaignStatus;
  readonly hostName: string | null;
  /** The zone of the host's weekly hours, or null when none are set. */
  readonly hostTimeZone: string | null;
  /** The alias that wrote to the prospect: the person the client knows the sender as. */
  readonly alias: { readonly displayName: string; readonly jobTitle: string } | null;
}

/** A lead whose meeting was held and that waits for the client to accept or reject it. */
export interface DecisionItem {
  readonly id: string;
  readonly publicRef: string;
  readonly prospectName: string;
  readonly prospectCompany: string;
  readonly campaignName: string;
  readonly campaignStatus: CampaignStatus;
  readonly meetingTime: Date | null;
  readonly outcomeRecordedAt: Date;
}

const times = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);

/**
 * Both queues of the client's Availability screen in one read: leads waiting for a time (oldest first, the longest wait is answered next) and
 * leads waiting for a decision (the one closest to its automatic acceptance first). Row-level security limits both to the client's own campaigns.
 */
export async function listClientQueues(db: Database, actor: TenantActor): Promise<{ readonly availability: readonly AvailabilityItem[]; readonly decisions: readonly DecisionItem[] }> {
  if (actor.orgKind !== "client") throw new DomainError("not-authorised", "Only client members can read the client's queues.");
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const rows = await tx
      .select({ ...clientLeadColumns, campaignName: campaign.name, campaignStatus: campaign.status })
      .from(lead)
      .innerJoin(campaign, eq(lead.campaignId, campaign.id))
      .where(and(eq(campaign.clientOrgId, actor.orgId), inArray(lead.stage, ["awaiting_client", "awaiting_decision"])))
      .orderBy(asc(lead.submittedAt));

    const waiting = rows.filter((row) => row.stage === "awaiting_client");
    const hostIds = [...new Set(waiting.flatMap((row) => (row.hostMemberId === null ? [] : [row.hostMemberId])))];
    const hosts = hostIds.length === 0 ? [] : await tx.select({ id: member.id, name: member.displayName }).from(member).where(inArray(member.id, hostIds));
    const zones = hostIds.length === 0 ? [] : await tx.select({ memberId: hostHours.memberId, timeZone: hostHours.timeZone }).from(hostHours).where(inArray(hostHours.memberId, hostIds));

    const availability: AvailabilityItem[] = [];
    for (const row of waiting) {
      const aliasRows = await tx.execute<{ display_name: string; job_title: string }>(sql`select display_name, job_title from public.app_lead_alias_name(${row.id}::uuid)`);
      const alias = aliasRows.rows[0];
      availability.push({
        id: row.id,
        publicRef: row.publicRef,
        prospectName: row.prospectName,
        prospectTitle: row.prospectTitle,
        prospectCompany: row.prospectCompany,
        prospectDomain: row.prospectDomain,
        prospectNotes: row.prospectNotes,
        bant: { budget: row.bantBudget, authority: row.bantAuthority, need: row.bantNeed, timeline: row.bantTimeline },
        qualification: { checks: row.qualificationChecks, notes: row.qualificationNotes },
        proposedTimes: times(row.proposedTimes),
        submittedAt: row.submittedAt,
        campaignName: row.campaignName,
        campaignStatus: row.campaignStatus,
        hostName: hosts.find((host) => host.id === row.hostMemberId)?.name ?? null,
        hostTimeZone: zones.find((zone) => zone.memberId === row.hostMemberId)?.timeZone ?? null,
        alias: alias === undefined ? null : { displayName: alias.display_name, jobTitle: alias.job_title },
      });
    }

    const decisions: DecisionItem[] = rows
      .filter((row) => row.stage === "awaiting_decision" && row.outcomeRecordedAt !== null)
      .map((row) => ({
        id: row.id,
        publicRef: row.publicRef,
        prospectName: row.prospectName,
        prospectCompany: row.prospectCompany,
        campaignName: row.campaignName,
        campaignStatus: row.campaignStatus,
        meetingTime: row.scheduledMeetingTime,
        outcomeRecordedAt: row.outcomeRecordedAt as Date,
      }))
      .sort((a, b) => a.outcomeRecordedAt.getTime() - b.outcomeRecordedAt.getTime());
    return { availability, decisions };
  });
}
