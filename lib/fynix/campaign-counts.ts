import type { CampaignStatus } from "@/lib/domain/campaign-status";

/** A client's or coordinator's campaigns by what people say about them: setting up (draft), active, and closed (paused, completed, archived). */
export interface CampaignCounts {
  readonly setup: number;
  readonly active: number;
  readonly closed: number;
}

export function tallyCampaigns(statuses: readonly CampaignStatus[]): CampaignCounts {
  let setup = 0;
  let active = 0;
  let closed = 0;
  for (const status of statuses) {
    if (status === "draft") setup += 1;
    else if (status === "active") active += 1;
    else closed += 1;
  }
  return { setup, active, closed };
}

/** "2 active, 1 closed", "1 setting up", or "None yet". Zero parts are left out. */
export function campaignCountsText(counts: CampaignCounts): string {
  const parts = [counts.active > 0 ? `${counts.active} active` : null, counts.closed > 0 ? `${counts.closed} closed` : null, counts.setup > 0 ? `${counts.setup} setting up` : null].filter((part): part is string => part !== null);
  return parts.length === 0 ? "None yet" : parts.join(", ");
}
