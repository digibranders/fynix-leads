import { and, eq } from "drizzle-orm";
import { campaign, campaignHost, member } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError, isUniqueViolation } from "@/server/domain/errors";
import { fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { addCampaignHostSchema, deactivateCampaignHostSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { snapshotHost } from "@/server/domain/snapshots";

/**
 * The client's people who take meetings for a campaign (spec 7.3). Fynix admins add and deactivate them in phase 1D; in 1E the
 * client's manager does. A host is never removed: deactivating keeps the row for the meetings the host took (phase 3).
 */

export interface HostRecord {
  readonly campaignId: string;
  readonly memberId: string;
  readonly displayName: string;
  readonly jobTitle: string;
  readonly active: boolean;
}

/**
 * Adds an active member of the campaign's client as a host, with the job title the supplier and its agencies are told. A host
 * who was deactivated is switched back on, with the new title, on the same row. The database pins the member to the campaign's
 * client with composite foreign keys (migration 0025); `client_org_id` on the row is copied from the campaign here.
 */
export async function addCampaignHost(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<HostRecord> {
  const parsed = parseInput(addCampaignHostSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [target] = await tx.select({ id: campaign.id, clientOrgId: campaign.clientOrgId, publicRef: campaign.publicRef }).from(campaign).where(eq(campaign.id, parsed.campaignId)).limit(1).for("share");
    if (target === undefined) throw new DomainError("not-found", "There is no such campaign.");
    const [person] = await tx
      .select({ id: member.id, orgId: member.orgId, orgKind: member.orgKind, status: member.status, displayName: member.displayName })
      .from(member)
      .where(eq(member.id, parsed.memberId))
      .limit(1)
      .for("share");
    if (person === undefined || person.orgKind !== "client" || person.orgId !== target.clientOrgId || person.status !== "active") {
      throw new DomainError("not-a-client-member", "A host is an active member of the campaign's client.");
    }
    const [existing] = await tx
      .select({ id: campaignHost.id, jobTitle: campaignHost.jobTitle, active: campaignHost.active })
      .from(campaignHost)
      .where(and(eq(campaignHost.campaignId, target.id), eq(campaignHost.memberId, person.id)))
      .limit(1)
      .for("update");
    if (existing?.active === true) throw new DomainError("invalid-transition", "That person is a host of the campaign already.");
    let saved: { readonly id: string; readonly jobTitle: string; readonly active: boolean } | undefined;
    try {
      [saved] =
        existing === undefined
          ? await tx.insert(campaignHost).values({ campaignId: target.id, clientOrgId: target.clientOrgId, memberId: person.id, jobTitle: parsed.jobTitle }).returning({ id: campaignHost.id, jobTitle: campaignHost.jobTitle, active: campaignHost.active })
          : await tx.update(campaignHost).set({ jobTitle: parsed.jobTitle, active: true }).where(eq(campaignHost.id, existing.id)).returning({ id: campaignHost.id, jobTitle: campaignHost.jobTitle, active: campaignHost.active });
    } catch (error) {
      if (isUniqueViolation(error, "campaign_host_campaign_member_unique")) throw new DomainError("invalid-transition", "That person is a host of the campaign already.");
      throw error;
    }
    if (saved === undefined) throw new Error("The host write returned no row");
    await audit({
      action: "campaign_host.add",
      subject: { table: "campaign_host", id: saved.id, ref: target.publicRef },
      before: existing === undefined ? null : snapshotHost({ campaignId: target.id, memberId: person.id, jobTitle: existing.jobTitle, active: existing.active }),
      after: snapshotHost({ campaignId: target.id, memberId: person.id, jobTitle: saved.jobTitle, active: saved.active }),
    });
    return { campaignId: target.id, memberId: person.id, displayName: person.displayName, jobTitle: saved.jobTitle, active: saved.active };
  });
}

/** Switches a host off. The row stays, with its title, for the meetings the host took. A member who is not a host, or is already off, is refused. */
export async function deactivateCampaignHost(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<HostRecord> {
  const parsed = parseInput(deactivateCampaignHostSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [existing] = await tx
      .select({ id: campaignHost.id, jobTitle: campaignHost.jobTitle, active: campaignHost.active, displayName: member.displayName, campaignRef: campaign.publicRef })
      .from(campaignHost)
      .innerJoin(member, eq(member.id, campaignHost.memberId))
      .innerJoin(campaign, eq(campaign.id, campaignHost.campaignId))
      .where(and(eq(campaignHost.campaignId, parsed.campaignId), eq(campaignHost.memberId, parsed.memberId)))
      .limit(1)
      .for("update", { of: campaignHost });
    if (existing === undefined) throw new DomainError("not-found", "That person is not a host of the campaign.");
    if (!existing.active) throw new DomainError("invalid-transition", "That host is deactivated already.");
    await tx.update(campaignHost).set({ active: false }).where(eq(campaignHost.id, existing.id));
    const row = { campaignId: parsed.campaignId, memberId: parsed.memberId, jobTitle: existing.jobTitle };
    await audit({
      action: "campaign_host.deactivate",
      subject: { table: "campaign_host", id: existing.id, ref: existing.campaignRef },
      before: snapshotHost({ ...row, active: true }),
      after: snapshotHost({ ...row, active: false }),
    });
    return { ...row, displayName: existing.displayName, active: false };
  });
}
