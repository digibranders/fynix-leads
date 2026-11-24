"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { TabNav } from "@/components/kit/tab-nav";

export interface RecordTab {
  /** The path segment under the record, or null for the Overview. */
  readonly key: string | null;
  readonly label: string;
  readonly count?: number;
}

/** The sub-pages under a client or coordinator title. One path segment each, so a tab is a link and the back button works. */
export function RecordTabs({ base, tabs, label }: { base: string; tabs: readonly RecordTab[]; label: string }) {
  const segment = useSelectedLayoutSegment();
  return (
    <div className="-mx-3">
      <TabNav label={label} items={tabs.map((tab) => ({ label: tab.label, href: tab.key === null ? base : `${base}/${tab.key}`, count: tab.count, active: tab.key === segment }))} />
    </div>
  );
}
