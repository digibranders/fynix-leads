import type { Icon } from "@phosphor-icons/react";
import { ArrowsClockwise, ChatCircleDots, Hourglass, Warning } from "@phosphor-icons/react/dist/ssr";
import { pillCount } from "@/lib/campaign/progress";
import type { CampaignStats } from "@/lib/campaign/stats";
import { cn } from "@/lib/utils";

const PANEL = "rounded-lg bg-surface shadow-raised";

type MonthProps = {
  delivered: number;
  target: number;
  /** For example "November 2026". */
  monthLabel: string;
};

/** The white "This month" tile: a figure and a bar of one pill per lead owed that month. */
export function MonthTile({ delivered, target, monthLabel }: MonthProps) {
  const remaining = Math.max(target - delivered, 0);
  const pills = pillCount(target);
  return (
    <section
      aria-label="This month"
      className={cn(PANEL, "grid grid-cols-1 items-center gap-x-[26px] gap-y-2.5 px-[22px] py-5 sm:grid-cols-[auto_1fr]")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 sm:col-span-2">
        <h2 className="text-[14.5px] leading-5 font-semibold tracking-[-0.005em]">This month</h2>
        <span className="text-[13px] text-ink-muted">
          {monthLabel}, {remaining === 0 ? "target reached" : `${remaining} still to deliver`}
        </span>
      </div>
      <p className="flex items-baseline gap-2 text-figure font-semibold tracking-figure">
        {delivered}
        <small className="text-body font-medium tracking-normal text-ink-muted">of {target} delivered</small>
      </p>
      <div
        role="img"
        aria-label={`${delivered} of ${target} delivered`}
        className="grid gap-[5px]"
        style={pills > 0 ? { gridTemplateColumns: `repeat(${pills}, minmax(0, 1fr))` } : undefined}
      >
        {Array.from({ length: pills }, (_, i) => (
          <i key={i} className={cn("h-2.5 rounded-full", i < delivered ? "bg-navy" : "bg-navy-07")} />
        ))}
      </div>
    </section>
  );
}

type Tone = "amber" | "blue" | "neutral";

const DISC: Record<Tone, string> = {
  amber: "bg-amber-soft text-amber-text",
  blue: "bg-blue-soft text-blue-text",
  neutral: "bg-navy-07 text-ink-2",
};

function StatTile({
  label,
  value,
  icon: Glyph,
  tone,
  caption,
}: {
  label: string;
  value: number;
  icon: Icon;
  tone: Tone;
  caption: React.ReactNode;
}) {
  return (
    <div className={cn(PANEL, "flex flex-col px-[18px] py-4")}>
      <div className="flex items-start justify-between gap-2.5">
        <p className="text-[13px] leading-[18px] font-medium text-ink-2">{label}</p>
        <span aria-hidden className={cn("grid size-[30px] shrink-0 place-items-center rounded-full", DISC[tone])}>
          <Glyph weight="fill" size={17} />
        </span>
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
        <p className="text-figure font-semibold tracking-figure">{value}</p>
        <p className="pb-[5px] text-right text-label text-ink-muted">{caption}</p>
      </div>
    </div>
  );
}

type Props = {
  stats: Pick<CampaignStats, "awaitingClientDecision" | "overdueAwaitingDecision" | "clarificationsToAnswer" | "replacementsOwed">;
  /** Refs of the rejected leads that still need a replacement. */
  replacementRefs: readonly string[];
};

/** Three small tiles: what is waiting on the client, what the agency owes. Every figure comes from `campaignStats`. */
export function StatTiles({ stats, replacementRefs }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatTile
        label="Awaiting client decision"
        value={stats.awaitingClientDecision}
        icon={Hourglass}
        tone="amber"
        caption={
          stats.overdueAwaitingDecision > 0 ? (
            <span className="inline-flex items-center gap-[5px] font-semibold text-red-text">
              <Warning aria-hidden weight="fill" size={14} />
              {stats.overdueAwaitingDecision} overdue
            </span>
          ) : (
            "None overdue"
          )
        }
      />
      <StatTile
        label="Clarifications to answer"
        value={stats.clarificationsToAnswer}
        icon={ChatCircleDots}
        tone="blue"
        caption={stats.clarificationsToAnswer > 0 ? "Waiting on your reply" : "Nothing waiting"}
      />
      <StatTile
        label="Replacements owed"
        value={stats.replacementsOwed}
        icon={ArrowsClockwise}
        tone="neutral"
        caption={
          replacementRefs.length > 0 ? (
            <>
              For{" "}
              {replacementRefs.map((ref, i) => (
                <span key={ref}>
                  {i > 0 && ", "}
                  <span className="font-mono text-caption font-medium text-ink-2">{ref}</span>
                </span>
              ))}
            </>
          ) : (
            "None owed"
          )
        }
      />
    </div>
  );
}
