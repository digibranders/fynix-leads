import { and, asc, eq } from "drizzle-orm";
import { summariseShares, type ShareSummary } from "@/lib/domain/share-allocation";
import { agreement, campaign, campaignShare, organisation } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixRead, fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { removeCampaignShareSchema, setCampaignShareSchema, uuidSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { snapshotShare } from "@/server/domain/snapshots";

/**
 * The shares of a supplier's monthly target (spec 7.2): the supplier splits its target between itself and its partner
 * agencies. A share goes to the campaign's supplier or one of its partner agencies (the database enforces it, migration
 * 0024). A total above the supplier's target is allowed, and the result says so (`overAllocated`) for the screen to show.
 * `setCampaignShare` and `removeCampaignShare` are Fynix admin writes in phase 1D; in 1E the supplier manager sets them.
 */

export interface ShareRecord {
  readonly campaignId: string;
  readonly agencyOrgId: string;
  readonly agencyRef: string;
  readonly agencyName: string;
  readonly monthlyShare: number;
}

export interface ShareResult {
  readonly share: ShareRecord;
  readonly summary: ShareSummary;
}

/** The total of a campaign's shares against the monthly target of its current supplier agreement (`null` when there is none). */
async function summarise(tx: ScopedTransaction, campaignId: string): Promise<ShareSummary> {
  const [supplierAgreement] = await tx
    .select({ monthlyTarget: agreement.monthlyTarget })
    .from(agreement)
    .where(and(eq(agreement.campaignId, campaignId), eq(agreement.party, "supplier"), eq(agreement.status, "current")))
    .limit(1);
  const shares = await tx.select({ monthlyShare: campaignShare.monthlyShare }).from(campaignShare).where(eq(campaignShare.campaignId, campaignId));
  return summariseShares(supplierAgreement?.monthlyTarget ?? null, shares.map((row) => row.monthlyShare));
}

/**
 * Sets an agency's monthly share of a campaign, creating it or changing it. The agency must be active and be the campaign's
 * supplier or a partner agency of it. The campaign row is locked first, so two admins setting shares for one campaign take
 * turns and each flag includes the other's change.
 */
export async function setCampaignShare(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<ShareResult> {
  const parsed = parseInput(setCampaignShareSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [target] = await tx.select({ id: campaign.id, supplierOrgId: campaign.agencyOrgId, publicRef: campaign.publicRef }).from(campaign).where(eq(campaign.id, parsed.campaignId)).limit(1).for("update");
    if (target === undefined) throw new DomainError("not-found", "There is no such campaign.");
    const [agency] = await tx
      .select({ id: organisation.id, publicRef: organisation.publicRef, name: organisation.name, kind: organisation.kind, status: organisation.status, parentOrgId: organisation.parentOrgId })
      .from(organisation)
      .where(eq(organisation.id, parsed.agencyOrgId))
      .limit(1);
    if (agency === undefined || agency.kind !== "agency") throw new DomainError("not-found", "There is no such agency.");
    if (agency.status !== "active") throw new DomainError("organisation-archived", "The agency is archived.");
    if (agency.id !== target.supplierOrgId && agency.parentOrgId !== target.supplierOrgId) {
      throw new DomainError("share-not-allowed", "A share goes to the campaign's coordinator or to one of its partner agencies.");
    }
    const [existing] = await tx
      .select({ id: campaignShare.id, monthlyShare: campaignShare.monthlyShare })
      .from(campaignShare)
      .where(and(eq(campaignShare.campaignId, target.id), eq(campaignShare.agencyOrgId, agency.id)))
      .limit(1)
      .for("update");
    const [saved] =
      existing === undefined
        ? await tx.insert(campaignShare).values({ campaignId: target.id, agencyOrgId: agency.id, monthlyShare: parsed.monthlyShare }).returning({ id: campaignShare.id, monthlyShare: campaignShare.monthlyShare })
        : await tx.update(campaignShare).set({ monthlyShare: parsed.monthlyShare, updatedAt: deps.now() }).where(eq(campaignShare.id, existing.id)).returning({ id: campaignShare.id, monthlyShare: campaignShare.monthlyShare });
    if (saved === undefined) throw new Error("The share write returned no row");
    await audit({
      action: "campaign_share.set",
      subject: { table: "campaign_share", id: saved.id, ref: `${target.publicRef} ${agency.publicRef}` },
      before: existing === undefined ? null : snapshotShare({ campaignId: target.id, agencyOrgId: agency.id, monthlyShare: existing.monthlyShare }),
      after: snapshotShare({ campaignId: target.id, agencyOrgId: agency.id, monthlyShare: saved.monthlyShare }),
    });
    return {
      share: { campaignId: target.id, agencyOrgId: agency.id, agencyRef: agency.publicRef, agencyName: agency.name, monthlyShare: saved.monthlyShare },
      summary: await summarise(tx, target.id),
    };
  });
}

/** Removes an agency's share of a campaign and returns the new summary. A share is a setting, so the row is deleted; the audit row keeps what it was. */
export async function removeCampaignShare(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<ShareSummary> {
  const parsed = parseInput(removeCampaignShareSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [target] = await tx.select({ id: campaign.id, publicRef: campaign.publicRef }).from(campaign).where(eq(campaign.id, parsed.campaignId)).limit(1).for("update");
    if (target === undefined) throw new DomainError("not-found", "There is no such campaign.");
    const [existing] = await tx
      .select({ id: campaignShare.id, monthlyShare: campaignShare.monthlyShare, agencyRef: organisation.publicRef })
      .from(campaignShare)
      .innerJoin(organisation, eq(organisation.id, campaignShare.agencyOrgId))
      .where(and(eq(campaignShare.campaignId, target.id), eq(campaignShare.agencyOrgId, parsed.agencyOrgId)))
      .limit(1)
      .for("update", { of: campaignShare });
    if (existing === undefined) throw new DomainError("not-found", "That agency has no share of the campaign.");
    await tx.delete(campaignShare).where(eq(campaignShare.id, existing.id));
    await audit({
      action: "campaign_share.remove",
      subject: { table: "campaign_share", id: existing.id, ref: `${target.publicRef} ${existing.agencyRef}` },
      before: snapshotShare({ campaignId: target.id, agencyOrgId: parsed.agencyOrgId, monthlyShare: existing.monthlyShare }),
      after: null,
    });
    return summarise(tx, target.id);
  });
}

/** A campaign's shares by agency name, with the summary. Open to Fynix staff. */
export async function listCampaignShares(deps: DomainDeps, actor: FynixActor, campaignId: string): Promise<{ readonly shares: readonly ShareRecord[]; readonly summary: ShareSummary }> {
  const id = parseInput(uuidSchema, campaignId);
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const [found] = await tx.select({ id: campaign.id }).from(campaign).where(eq(campaign.id, id)).limit(1);
    if (found === undefined) throw new DomainError("not-found", "There is no such campaign.");
    const shares = await tx
      .select({ campaignId: campaignShare.campaignId, agencyOrgId: campaignShare.agencyOrgId, agencyRef: organisation.publicRef, agencyName: organisation.name, monthlyShare: campaignShare.monthlyShare })
      .from(campaignShare)
      .innerJoin(organisation, eq(organisation.id, campaignShare.agencyOrgId))
      .where(eq(campaignShare.campaignId, id))
      .orderBy(asc(organisation.name));
    return { shares, summary: await summarise(tx, id) };
  });
}
