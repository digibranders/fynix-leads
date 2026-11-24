import { TabNav } from "@/components/kit/tab-nav";
import { CAMPAIGN_TAB_ORDER, campaignTabLabel, countByTab, DEFAULT_CAMPAIGN_TAB, type CampaignTab } from "@/lib/campaign-status";
import type { CampaignStatus } from "@/lib/domain/campaign-status";

/** The address of a campaign list on a tab. The default tab leaves the address clean. */
export function campaignTabHref(basePath: string, tab: CampaignTab, q = ""): string {
  const params = new URLSearchParams();
  if (tab !== DEFAULT_CAMPAIGN_TAB) params.set("status", tab);
  if (q.trim() !== "") params.set("q", q.trim());
  const query = params.toString();
  return query === "" ? basePath : `${basePath}?${query}`;
}

/** Active, Setting up, Closed and All, each with its count, on every campaign list. The selected tab lives in `?status=`. */
export function CampaignStatusTabs({ rows, basePath, tab, q = "" }: { rows: readonly { readonly status: CampaignStatus }[]; basePath: string; tab: CampaignTab; q?: string }) {
  const counts = countByTab(rows);
  return (
    <TabNav
      label="Campaign status"
      items={CAMPAIGN_TAB_ORDER.map((entry) => ({ label: campaignTabLabel(entry), href: campaignTabHref(basePath, entry, q), count: counts[entry], active: tab === entry }))}
    />
  );
}
