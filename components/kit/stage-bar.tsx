import Link from "next/link";
import { cn } from "@/lib/utils";

export interface StageSegment {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  /** The solid colour of the segment and its swatch, a status solid from the tokens. */
  readonly color: string;
  readonly href: string;
  readonly active?: boolean;
}

/**
 * A pipeline at a glance: one segmented bar for the shape of the work, and a row of chips that are also the filter.
 * Each chip is a link, so the filter lives in the URL and works without script.
 */
export function StageBar({ allHref, allCount, allActive, segments }: { allHref: string; allCount: number; allActive: boolean; segments: readonly StageSegment[] }) {
  const shown = segments.filter((segment) => segment.count > 0);
  return (
    <div className="flex flex-col gap-3.5 rounded-lg bg-surface p-5 shadow-raised">
      <div role="img" aria-label={`Leads by stage: ${segments.map((s) => `${s.label} ${s.count}`).join(", ")}`} className="flex h-2.5 gap-[3px]">
        {shown.map((segment) => (
          <i key={segment.key} className="min-w-1.5 rounded-[3px]" style={{ flex: segment.count, background: segment.color }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-2">
        <li>
          <Chip href={allHref} active={allActive}>
            All <b>{allCount}</b>
          </Chip>
        </li>
        {segments.map((segment) => (
          <li key={segment.key}>
            <Chip href={segment.href} active={segment.active ?? false}>
              <i aria-hidden className="size-2 rounded-[3px]" style={{ background: segment.color }} />
              {segment.label} <b>{segment.count}</b>
            </Chip>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors [&_b]:font-semibold",
        active ? "bg-navy text-offwhite [&_b]:text-white" : "bg-navy-05 text-ink-2 hover:bg-navy-08 [&_b]:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
