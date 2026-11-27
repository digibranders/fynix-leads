import type { CalendarPersonLike } from "@/lib/calendar/layout";
import type { Database } from "@/server/db/pool";
import type { TenantActor } from "@/server/domain/alias-identity";
import type { DomainDeps } from "@/server/domain/deps";
import { toPerson } from "@/server/domain/calendar-data";
import { getOwnDraft } from "@/server/domain/lead-reads";
import type { FynixActor } from "@/server/domain/fynix-write";
import { readTeamTimeForFynix, readTeamTimeForTenant } from "@/server/domain/team-availability";

/** How far ahead the lead form offers times. A calendar read covers at most 62 days. */
const OFFER_DAYS = 60;

/**
 * The client team of each campaign the lead form offers, with working hours and busy time for the next 60 days, by campaign id. The form works out the free times
 * from it. A campaign whose team cannot be read is left out and the form says it cannot offer times.
 */
export async function loadCampaignTeams(db: Database, deps: Pick<DomainDeps, "now">, actor: TenantActor, campaignIds: readonly string[]): Promise<Record<string, readonly CalendarPersonLike[]>> {
  const from = deps.now();
  const to = new Date(from.getTime() + OFFER_DAYS * 86_400_000);
  const entries = await Promise.all(
    [...new Set(campaignIds)].map(async (campaignId) => {
      try {
        return [campaignId, (await readTeamTimeForTenant(db, actor, { campaignId, from: from.toISOString(), to: to.toISOString() })).map(toPerson)] as const;
      } catch {
        // shortcut: a team that cannot be read is left out silently, because domain files may not log; upgrade when the action layer can report it.
        return null;
      }
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== null));
}

/** The proposed times a draft holds, as ISO strings. */
const timesOf = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);

/** The same for Fynix, which reads any client's team: for booking a new time from the lead record. */
export async function loadCampaignTeamsForFynix(deps: Pick<DomainDeps, "now" | "fynixDb">, actor: FynixActor, campaignIds: readonly string[]): Promise<Record<string, readonly CalendarPersonLike[]>> {
  const from = deps.now();
  const to = new Date(from.getTime() + OFFER_DAYS * 86_400_000);
  const entries = await Promise.all(
    [...new Set(campaignIds)].map(async (campaignId) => {
      try {
        return [campaignId, (await readTeamTimeForFynix(deps, actor, { campaignId, from: from.toISOString(), to: to.toISOString() })).map(toPerson)] as const;
      } catch {
        // shortcut: a team that cannot be read is left out silently, because domain files may not log; upgrade when the action layer can report it.
        return null;
      }
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== null));
}

/** The form values of the organisation's own draft, by reference. `not-found` for anything that is not its draft. */
export async function loadDraftPrefill(db: Database, actor: TenantActor, publicRef: string) {
  const row = await getOwnDraft(db, actor, publicRef);
  return {
    id: row.id,
    campaignId: row.campaignId,
    aliasIdentityId: row.aliasIdentityId,
    hostMemberId: row.hostMemberId,
    prospectName: row.prospectName,
    prospectTitle: row.prospectTitle,
    prospectCompany: row.prospectCompany,
    prospectDomain: row.prospectDomain,
    prospectLinkedinUrl: row.prospectLinkedinUrl,
    prospectEmail: row.prospectEmail,
    prospectPhone: row.prospectPhone,
    prospectNotes: row.prospectNotes,
    bantBudget: row.bantBudget,
    bantAuthority: row.bantAuthority,
    bantNeed: row.bantNeed,
    bantTimeline: row.bantTimeline,
    qualificationChecks: row.qualificationChecks,
    qualificationNotes: row.qualificationNotes,
    proposedTimes: timesOf(row.proposedTimes),
  };
}
