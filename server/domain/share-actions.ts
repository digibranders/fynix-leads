"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/server/auth";
import { getDatabase } from "@/server/db/client";
import { assignCampaignShare, unassignCampaignShare } from "@/server/domain/campaign-shares-tenant";
import { DomainError } from "@/server/domain/errors";

export interface ShareActionResult {
  readonly status: "success" | "error";
  readonly message?: string;
}

async function run(work: (db: ReturnType<typeof getDatabase>["db"], actor: { userId: string; orgId: string; orgKind: "agency"; role: "member" | "manager" }) => Promise<void>, failure: string): Promise<ShareActionResult> {
  const context = await getSessionContext();
  if (context === null || context.kind !== "agency") return { status: "error", message: "Only a coordinator can assign a campaign." };
  try {
    await work(getDatabase("leads_agency").db, { userId: context.userId, orgId: context.orgId, orgKind: "agency", role: context.memberRole });
    revalidatePath("/coordinator/campaigns");
    revalidatePath("/coordinator/agencies");
    revalidatePath("/agency/campaigns");
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: error instanceof DomainError ? error.message : failure };
  }
}

/** Assigns a campaign to an agency, or changes the monthly share it holds. */
export async function assignShareAction(campaignId: string, agencyOrgId: string, monthlyShare: number): Promise<ShareActionResult> {
  return run((db, actor) => assignCampaignShare(db, actor, { campaignId, agencyOrgId, monthlyShare }), "The campaign could not be assigned. Try again.");
}

/** Takes a campaign back from an agency. */
export async function unassignShareAction(campaignId: string, agencyOrgId: string): Promise<ShareActionResult> {
  return run((db, actor) => unassignCampaignShare(db, actor, { campaignId, agencyOrgId }), "The campaign could not be taken back. Try again.");
}
