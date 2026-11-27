import { and, asc, eq, gt, sql } from "drizzle-orm";
import { proposedTimeWarnings, withDefaultHours, type HostAvailability, type ProposedTimeWarning } from "@/lib/leads/host-hours";
import type { Database } from "@/server/db/pool";
import { hostBlock, hostHours } from "@/server/db/schema";
import { withTenantScope, type ScopedTransaction } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { checkProposedTimesSchema, hostAvailabilitySchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";

/**
 * What the lead form shows about a person of the client (owner decisions of 2026-11-24 and 2026-11-26: the supply side sees the name and nothing else). A name,
 * the zone and weekly windows the person takes meetings in, and the times they have blocked, with no note and never a job title, an email or a phone: the
 * agency role holds no grant on them, and the name comes from a database function that answers for the team of a campaign the caller serves.
 */
export interface HostAvailabilityRecord extends HostAvailability {
  readonly hostMemberId: string;
  readonly displayName: string;
}

export interface TeamChoice {
  readonly memberId: string;
  readonly displayName: string;
  /** The client's own time zone, for a person who has set no hours. */
  readonly timeZone: string | null;
}

/** The active people of the campaign's client, for a campaign the organisation serves. A name and the client's zone, never a job title or an email. */
export async function listCampaignTeam(tx: ScopedTransaction, campaignId: string): Promise<readonly TeamChoice[]> {
  const rows = await tx.execute<{ member_id: string; display_name: string; time_zone: string | null }>(
    sql`select member_id, display_name, time_zone from public.app_campaign_team(${campaignId}::uuid)`,
  );
  return rows.rows.map((row) => ({ memberId: row.member_id, displayName: row.display_name, timeZone: row.time_zone }));
}

/** The chosen person must be an active member of the campaign's client. The lead form, a draft and the hours read all ask here. */
export async function requireTeamMember(tx: ScopedTransaction, campaignId: string, memberId: string): Promise<TeamChoice> {
  const choice = (await listCampaignTeam(tx, campaignId)).find((person) => person.memberId === memberId);
  if (choice === undefined) throw new DomainError("not-found", "That person is not an active member of this client's team.");
  return choice;
}

async function readAvailability(tx: ScopedTransaction, actor: TenantActor, hostMemberId: string, campaignId: string, now: Date): Promise<HostAvailabilityRecord> {
  if (actor.orgKind !== "agency") throw new DomainError("not-authorised", "Only agency or coordinator members pick a client team member for a lead.");
  const named = await requireTeamMember(tx, campaignId, hostMemberId);

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
  const own: HostAvailability = { timeZone: windows[0]?.timeZone ?? null, hours: windows.map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute })), blocks };
  // A person who has set no hours is taken to work Monday to Friday, 09:00 to 17:00 in the client's time zone.
  return { hostMemberId, displayName: named.displayName, ...withDefaultHours(own, named.timeZone) };
}

/** The person's weekly hours with their IANA time zone and the blocked times still to come, for the form's second time zone and its time list. */
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
