import { and, eq } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import { agreement, agreementAcceptance, campaign } from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";

export interface TenantAgreement {
  readonly id: string;
  readonly campaignName: string;
  readonly clientBrandName: string;
  readonly version: number;
  readonly monthlyTarget: number;
  readonly totalTarget: number;
  readonly disputeWindowHours: number;
  readonly rules: string;
  readonly publishedAt: Date;
  /** When the signed-in person accepted this version, or null. */
  readonly acceptedAt: Date | null;
}

/**
 * The current agreement of every campaign the organisation sees, for one party (`client` for a client, `supplier` for a supplier),
 * with whether the signed-in person has accepted it. Row access is the database's: a client sees only client agreements of its own
 * campaigns, a supplier only supplier agreements of its own.
 */
export async function listCurrentAgreements(
  db: Database,
  actor: { readonly userId: string; readonly orgId: string },
  party: "client" | "supplier",
): Promise<readonly TenantAgreement[]> {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const rows = await tx
      .select({
        id: agreement.id,
        campaignName: campaign.name,
        clientBrandName: campaign.clientBrandName,
        version: agreement.version,
        monthlyTarget: agreement.monthlyTarget,
        totalTarget: agreement.totalTarget,
        disputeWindowHours: agreement.disputeWindowHours,
        rules: agreement.rules,
        publishedAt: agreement.createdAt,
      })
      .from(agreement)
      .innerJoin(campaign, eq(campaign.id, agreement.campaignId))
      .where(and(eq(agreement.party, party), eq(agreement.status, "current")))
      .orderBy(campaign.name);

    const accepted = await tx
      .select({ agreementId: agreementAcceptance.agreementId, acceptedAt: agreementAcceptance.acceptedAt })
      .from(agreementAcceptance)
      .where(eq(agreementAcceptance.userId, actor.userId));
    const acceptedAt = new Map(accepted.map((row) => [row.agreementId, row.acceptedAt]));

    return rows.map((row) => ({ ...row, acceptedAt: acceptedAt.get(row.id) ?? null }));
  });
}
