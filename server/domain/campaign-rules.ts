import { eq, sql } from "drizzle-orm";
import { goLiveRefusal, isClosed, type GoLiveState } from "@/lib/campaign-status";
import type { CampaignStatus } from "@/lib/domain/campaign-status";
import { campaign } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import { DomainError } from "@/server/domain/errors";

/** The agreement and host facts the going-live rule reads, from the database function `campaign_go_live_state` (migration 0064). Fynix transactions only. */
export async function readGoLiveState(tx: ScopedTransaction, campaignId: string): Promise<GoLiveState> {
  const result = await tx.execute<{ agreed: boolean; client_accepted: boolean; supplier_accepted: boolean; has_host: boolean }>(
    sql`select agreed, client_accepted, supplier_accepted, has_host from public.campaign_go_live_state(${campaignId}::uuid)`,
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("campaign_go_live_state returned no row");
  return { agreed: row.agreed, clientAccepted: row.client_accepted, coordinatorAccepted: row.supplier_accepted, hasHost: row.has_host };
}

/** Refuses with `agreement-not-accepted` (the message names the side that is missing) or `no-host` unless the campaign may go live. */
export async function assertCanGoLive(tx: ScopedTransaction, campaignId: string): Promise<void> {
  const refusal = goLiveRefusal(await readGoLiveState(tx, campaignId));
  if (refusal !== null) throw new DomainError(refusal.code, refusal.message);
}

/** A closed campaign is read only: refuses `campaign-closed` for a paused, completed or archived status. */
export function assertCampaignOpen(status: CampaignStatus): void {
  if (isClosed(status)) throw new DomainError("campaign-closed", "That campaign is closed, so it cannot be changed. Reopen it first.");
}

/** Reads the campaign's status (locking it for share) and refuses `campaign-closed`; `not-found` when there is no such campaign. Works for any role that can read the campaign. */
export async function requireOpenCampaign(tx: ScopedTransaction, campaignId: string): Promise<void> {
  const [row] = await tx.select({ status: campaign.status }).from(campaign).where(eq(campaign.id, campaignId)).limit(1);
  if (row === undefined) throw new DomainError("not-found", "There is no such campaign.");
  assertCampaignOpen(row.status);
}
