"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { cn } from "@/lib/utils";

type Props = { reference: string; hostCount: number };

/** The tabs under the campaign title. One path segment each, so a tab is a link and the browser's back button works. */
export function CampaignTabs({ reference, hostCount }: Props) {
  const segment = useSelectedLayoutSegment();
  const base = `/fynix/campaigns/${reference}`;
  const tabs = [
    { key: null, label: "Brief", href: base },
    { key: "hosts", label: "Hosts", href: `${base}/hosts`, count: hostCount },
    { key: "agreements", label: "Agreements and shares", href: `${base}/agreements` },
    { key: "activity", label: "Activity", href: `${base}/activity` },
  ] as const;
  return (
    <nav aria-label="Campaign sections" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      <ul className="inline-flex h-[42px] min-w-full items-center gap-0.5 rounded-full bg-navy-05 p-[3px] md:flex">
        {tabs.map((tab) => {
          const active = tab.key === segment;
          return (
            <li key={tab.label}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-[7px] rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap text-ink-2 transition-[background-color,color] hover:bg-navy-05",
                  active && "bg-primary font-semibold text-primary-foreground shadow-segment hover:bg-primary",
                )}
              >
                {tab.label}
                {"count" in tab && <b className={cn("font-semibold", active ? "text-peach" : "text-ink-2")}>{tab.count}</b>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
