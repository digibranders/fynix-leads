import type { CampaignStatus } from "@/lib/domain/campaign-status";

/**
 * What people are shown for a campaign: three states over the five database statuses. Setting up is `draft`; Closed is `paused`,
 * `completed` and `archived`. A closed campaign is read only.
 */
export type CampaignBucket = "setting-up" | "active" | "closed";
export type CampaignTone = "quiet" | "green" | "amber";

export function campaignBucket(status: CampaignStatus): CampaignBucket {
  if (status === "draft") return "setting-up";
  return status === "active" ? "active" : "closed";
}

export const isClosed = (status: CampaignStatus): boolean => campaignBucket(status) === "closed";

const LABEL: Readonly<Record<CampaignBucket, string>> = { "setting-up": "Setting up", active: "Active", closed: "Closed" };
const TONE: Readonly<Record<CampaignBucket, CampaignTone>> = { "setting-up": "quiet", active: "green", closed: "amber" };

export const campaignStatusLabel = (status: CampaignStatus): string => LABEL[campaignBucket(status)];
export const campaignStatusTone = (status: CampaignStatus): CampaignTone => TONE[campaignBucket(status)];

/** What the database knows about whether a campaign may go live (`campaign_go_live_state`, migration 0064). */
export interface GoLiveState {
  /** Both the client and the coordinator have accepted some version of the agreement. */
  readonly agreed: boolean;
  readonly clientAccepted: boolean;
  readonly coordinatorAccepted: boolean;
  readonly hasHost: boolean;
}

export interface GoLiveRefusal {
  readonly code: "agreement-not-accepted" | "no-host";
  readonly message: string;
}

/** The rule: a campaign goes live when the client and the coordinator have both accepted the agreement and the client has an active team member. */
export function goLiveRefusal(state: GoLiveState): GoLiveRefusal | null {
  if (!state.agreed) {
    const message =
      !state.clientAccepted && !state.coordinatorAccepted
        ? "Neither the client nor the coordinator has accepted the agreement yet."
        : `The ${state.clientAccepted ? "coordinator" : "client"} has not accepted the agreement yet.`;
    return { code: "agreement-not-accepted", message };
  }
  return state.hasHost ? null : { code: "no-host", message: "The client has no active team member yet." };
}

/** Why an agency's campaign is not taking leads, in words that name no person. Null when it is active. */
export function notLiveReason(input: GoLiveState & { readonly status: CampaignStatus }): string | null {
  if (input.status === "active") return null;
  if (isClosed(input.status)) return "The campaign is closed.";
  return goLiveRefusal(input)?.message ?? "Fynix has not made it active yet.";
}

export interface ActiveTotals {
  readonly campaigns: number;
  readonly monthlyTarget: number;
  readonly totalTarget: number;
  readonly delivered: number;
}

/** Sums over active campaigns only: closed and setting-up campaigns count for nothing on an overview. */
export function sumActiveCampaigns(rows: readonly { readonly status: CampaignStatus; readonly monthlyTarget: number; readonly totalTarget: number; readonly delivered: number }[]): ActiveTotals {
  const totals = { campaigns: 0, monthlyTarget: 0, totalTarget: 0, delivered: 0 };
  for (const row of rows) {
    if (row.status !== "active") continue;
    totals.campaigns += 1;
    totals.monthlyTarget += row.monthlyTarget;
    totals.totalTarget += row.totalTarget;
    totals.delivered += row.delivered;
  }
  return totals;
}

/** The tabs on every campaign list. With nothing in the address the list opens on Active, or on the first tab that has a campaign when Active is empty. */
export type CampaignTab = CampaignBucket | "all";
export const CAMPAIGN_TAB_ORDER: readonly CampaignTab[] = ["active", "setting-up", "closed", "all"];
export const DEFAULT_CAMPAIGN_TAB: CampaignTab = "active";
const TAB_LABEL: Readonly<Record<CampaignTab, string>> = { active: "Active", "setting-up": "Setting up", closed: "Closed", all: "All" };

export const campaignTabLabel = (tab: CampaignTab): string => TAB_LABEL[tab];

/** Reads `?status=`. Anything that is not a tab opens Active, or, when the rows are given and Active is empty, the first tab that holds one (Setting up, then Closed). */
export function parseCampaignTab(value: string | string[] | undefined, rows?: readonly { readonly status: CampaignStatus }[]): CampaignTab {
  const raw = Array.isArray(value) ? value[0] : value;
  const named = CAMPAIGN_TAB_ORDER.find((tab) => tab === raw);
  if (named !== undefined) return named;
  if (rows === undefined) return DEFAULT_CAMPAIGN_TAB;
  const counts = countByTab(rows);
  return (["active", "setting-up", "closed"] as const).find((tab) => counts[tab] > 0) ?? DEFAULT_CAMPAIGN_TAB;
}

/** How many rows each tab holds. */
export function countByTab(rows: readonly { readonly status: CampaignStatus }[]): Record<CampaignTab, number> {
  const counts: Record<CampaignTab, number> = { active: 0, "setting-up": 0, closed: 0, all: rows.length };
  for (const row of rows) counts[campaignBucket(row.status)] += 1;
  return counts;
}

export function inCampaignTab<T extends { readonly status: CampaignStatus }>(rows: readonly T[], tab: CampaignTab): T[] {
  return rows.filter((row) => tab === "all" || campaignBucket(row.status) === tab);
}

export interface CampaignChoice {
  readonly id: string;
  readonly name: string;
  readonly status: CampaignStatus;
}

export interface CampaignChoiceGroup {
  readonly label: string;
  readonly items: readonly CampaignChoice[];
}

/** The campaign filter's options: active campaigns first, then the ones still being set up, then the closed ones grouped below. Empty groups are left out. */
export function campaignChoiceGroups(campaigns: readonly CampaignChoice[]): CampaignChoiceGroup[] {
  const byName = [...campaigns].sort((a, b) => a.name.localeCompare(b.name));
  return (["active", "setting-up", "closed"] as const)
    .map((bucket) => ({ label: TAB_LABEL[bucket], items: byName.filter((row) => campaignBucket(row.status) === bucket) }))
    .filter((group) => group.items.length > 0);
}

/** Reads `?campaign=`: only an id the viewer can see counts, so a stale or forged value shows everything. */
export function parseCampaignFilter(value: string | string[] | undefined, campaigns: readonly { readonly id: string }[]): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw !== undefined && campaigns.some((row) => row.id === raw) ? raw : null;
}

/** The ids of the closed campaigns, for a "Closed" tag on a row. */
export const closedCampaignIds = (campaigns: readonly CampaignChoice[]): ReadonlySet<string> => new Set(campaigns.filter((row) => isClosed(row.status)).map((row) => row.id));

/** Addresses for the campaign filter: one per campaign and one that clears it. `hrefFor(null)` is the address with no campaign chosen. */
export function campaignFilterHrefs(campaigns: readonly { readonly id: string }[], hrefFor: (campaignId: string | null) => string): { readonly allHref: string; readonly hrefs: Readonly<Record<string, string>> } {
  return { allHref: hrefFor(null), hrefs: Object.fromEntries(campaigns.map((row) => [row.id, hrefFor(row.id)])) };
}
