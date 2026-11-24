/** The statuses of a campaign, in the order the database enum lists them. `archived` is how a campaign is removed (nothing is deleted). */
export const CAMPAIGN_STATUSES = ["draft", "active", "paused", "completed", "archived"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/**
 * Which status a campaign may move to from each status. A campaign starts as a draft, runs, may pause and resume, and
 * ends as completed. Any of them can be archived, and an archived campaign can only be restored to draft, so it never
 * jumps straight back to running. A closed campaign (paused, completed, archived) is reopened to draft, and Fynix makes it active
 * again only once the going-live rule holds; a draft can be closed without ever running.
 */
const TRANSITIONS: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> = {
  draft: ["active", "completed", "archived"],
  active: ["paused", "completed", "archived"],
  paused: ["active", "completed", "draft", "archived"],
  completed: ["draft", "archived"],
  archived: ["draft"],
};

export function canMoveCampaign(from: CampaignStatus, to: CampaignStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** What the audit log calls a status change: moving into `archived` and out of it have their own names. */
export function campaignAuditAction(from: CampaignStatus, to: CampaignStatus): "campaign.update" | "campaign.archive" | "campaign.restore" {
  if (to === "archived") return "campaign.archive";
  if (from === "archived") return "campaign.restore";
  return "campaign.update";
}
