import { asc, eq } from "drizzle-orm";
import { campaign, lead } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";

/** One lead the client has disputed and Fynix has yet to decide. */
export interface DisputeRow {
  readonly leadId: string;
  readonly leadRef: string;
  readonly campaignName: string;
  readonly clientBrandName: string;
  readonly prospectName: string;
  readonly prospectCompany: string;
  readonly reason: string;
  readonly disputedAt: Date | null;
}

/** Open disputes, oldest first so the longest wait is on top. Fynix read, open to staff. */
export async function listOpenDisputes(deps: DomainDeps, actor: FynixActor): Promise<readonly DisputeRow[]> {
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const rows = await tx
      .select({
        leadId: lead.id,
        leadRef: lead.publicRef,
        campaignName: campaign.name,
        clientBrandName: campaign.clientBrandName,
        prospectName: lead.prospectName,
        prospectCompany: lead.prospectCompany,
        reason: lead.disputeReason,
        disputedAt: lead.disputedAt,
      })
      .from(lead)
      .innerJoin(campaign, eq(lead.campaignId, campaign.id))
      .where(eq(lead.stage, "disputed"))
      .orderBy(asc(lead.disputedAt));
    return rows.map((row): DisputeRow => ({ ...row, reason: row.reason ?? "" }));
  });
}
