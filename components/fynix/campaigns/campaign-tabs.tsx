"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { TabNav } from "@/components/kit/tab-nav";

type Props = { reference: string; hostCount: number };

/** The sub-pages under the campaign title. One path segment each, so a tab is a link and the browser's back button works. */
export function CampaignTabs({ reference, hostCount }: Props) {
  const segment = useSelectedLayoutSegment();
  const base = `/fynix/campaigns/${reference}`;
  const tabs = [
    { key: null, label: "Brief", href: base },
    { key: "hosts", label: "Hosts", href: `${base}/hosts`, count: hostCount },
    { key: "agreements", label: "Agreements and shares", href: `${base}/agreements` },
    { key: "leads", label: "Leads", href: `${base}/leads` },
    { key: "meetings", label: "Meetings", href: `${base}/meetings` },
    { key: "activity", label: "Activity", href: `${base}/activity` },
  ] as const;
  return (
    <div className="-mx-3">
      <TabNav
        label="Campaign sections"
        items={tabs.map((tab) => ({ label: tab.label, href: tab.href, count: "count" in tab ? tab.count : undefined, active: tab.key === segment }))}
      />
    </div>
  );
}
