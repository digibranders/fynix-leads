import { and, asc, eq, gt, sql } from "drizzle-orm";
import { proposedTimeWarnings, type HostAvailability, type ProposedTimeWarning } from "@/lib/leads/host-hours";
import type { Database } from "@/server/db/pool";
import { campaignHost, hostBlock, hostHours } from "@/server/db/schema";
import { withTenantScope, type ScopedTransaction } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { checkProposedTimesSchema, hostAvailabilitySchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";

/**
 * What the lead form shows about a host (lead flow decision and the owner's note of 2026-11-24: the supply side sees the host's name). A name, a job title,
 * the zone and weekly windows the host takes meetings in, and the times it has blocked, with no note and never an email or a phone: the agency role holds no
 * grant on them, and the name comes from a database function that answers for the hosts of a campaign the caller serves.
 */
export interface HostAvailabilityRecord extends HostAvailability {
  readonly hostMemberId: string;
  readonly displayName: string;
  readonly jobTitle: string;
}

/** The active hosts of a campaign the organisation serves, with their names and titles. */
export async function listCampaignHostChoices(tx: ScopedTransaction, campaignId: string) {
  const rows = await tx.execute<{ member_id: string; display_name: string; job_title: string }>(sql`select member_id, display_name, job_title from public.app_campaign_host_names(${campaignId}::uuid)`);
  return rows.rows.map((row) => ({ memberId: row.member_id, displayName: row.display_name, jobTitle: row.job_title }));
}

async function readAvailability(tx: ScopedTransaction, actor: TenantActor, hostMemberId: string, campaignId: string, now: Date): Promise<HostAvailabilityRecord> {
  if (actor.orgKind !== "agency") throw new DomainError("not-authorised", "Only agency or coordinator members pick a host for a lead.");
  const [active] = await tx
    .select({ memberId: campaignHost.memberId })
    .from(campaignHost)
    .where(and(eq(campaignHost.campaignId, campaignId), eq(campaignHost.memberId, hostMemberId), eq(campaignHost.active, true)))
    .limit(1);
  const named = active === undefined ? undefined : (await listCampaignHostChoices(tx, campaignId)).find((choice) => choice.memberId === hostMemberId);
  if (named === undefined) throw new DomainError("not-found", "The specified host is not an active host for this campaign.");

  const windows = await tx
    .select({ weekday: hostHours.weekday, startMinute: hostHours.startMinute, endMinute: hostHours.endMinute, timeZone: hostHours.timeZone })
    .from(hostHours)
    .where(eq(hostHours.memberId, hostMemberId))
    .orderBy(asc(hostHours.weekday), asc(hostHours.startMinute));
  const blocks = await tx
    .select({ startsAt: hostBlock.startsAt, endsAt: hostBlock.endsAt })
    .from(hostBlock)
    .where(and(eq(hostBlock.memberId, hostMemberId), gt(hostBlock.endsAt, now)))
    .orderBy(asc(hostBlock.startsAt));
  return {
    hostMemberId,
    displayName: named.displayName,
    jobTitle: named.jobTitle,
    timeZone: windows[0]?.timeZone ?? null,
    hours: windows.map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute })),
    blocks,
  };
}

/** The host's weekly hours with their IANA time zone and the blocked times still to come, for the form's second time zone and its time list. */
export async function getHostAvailability(db: Database, deps: Pick<DomainDeps, "now">, actor: TenantActor, hostMemberId: string, campaignId: string): Promise<HostAvailabilityRecord> {
  const parsed = parseInput(hostAvailabilitySchema, { hostMemberId, campaignId });
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, (tx) => readAvailability(tx, actor, parsed.hostMemberId, parsed.campaignId, deps.now()));
}

/**
 * The warnings for the times a lead proposes, before it is sent: outside the host's working hours, or inside a blocked time. It never refuses; the client
 * picks the time. `submitLead` does not call it, so a warning cannot block a lead.
 */
export async function checkProposedTimes(db: Database, deps: Pick<DomainDeps, "now">, actor: TenantActor, input: unknown): Promise<{ readonly warnings: readonly ProposedTimeWarning[] }> {
  const parsed = parseInput(checkProposedTimesSchema, input);
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const availability = await readAvailability(tx, actor, parsed.hostMemberId, parsed.campaignId, deps.now());
    return { warnings: proposedTimeWarnings(parsed.proposedTimes, availability) };
  });
}
