import type { HostAvailability } from "@/lib/leads/host-hours";
import type { Database } from "@/server/db/pool";
import type { TenantActor } from "@/server/domain/alias-identity";
import type { DomainDeps } from "@/server/domain/deps";
import { getHostAvailability } from "@/server/domain/host-availability";
import { getOwnDraft } from "@/server/domain/lead-reads";

/** The proposed times a draft holds, as ISO strings. */
const timesOf = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);

/**
 * The weekly hours, blocked times and zone of each host the lead form offers, by member id. A host's hours do not depend on the campaign, so a host that
 * serves two campaigns is read once. A host whose hours cannot be read (just paused, say) is left out and the form says it cannot check.
 */
export async function loadHostAvailability(db: Database, deps: Pick<DomainDeps, "now">, actor: TenantActor, hosts: readonly { readonly id: string; readonly campaignId: string }[]): Promise<Record<string, HostAvailability>> {
  const firstCampaign = new Map<string, string>();
  for (const host of hosts) if (!firstCampaign.has(host.id)) firstCampaign.set(host.id, host.campaignId);
  const entries = await Promise.all(
    [...firstCampaign].map(async ([memberId, campaignId]) => {
      try {
        const { timeZone, hours, blocks } = await getHostAvailability(db, deps, actor, memberId, campaignId);
        return [memberId, { timeZone, hours, blocks } satisfies HostAvailability] as const;
      } catch {
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
    proposedTimes: timesOf(row.proposedTimes),
  };
}
