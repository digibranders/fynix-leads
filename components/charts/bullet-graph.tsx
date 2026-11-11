import { cn } from "@/lib/utils";

type Props = {
  label: string;
  delivered: number;
  target: number;
  comparison: string;
  /** "hero" is the peach fill on navy, for the one hero tile per screen. */
  tone?: "default" | "hero";
};

/** A soft rounded bar: the fill is delivered, the tick is the target. No gauges or donuts. */
export function BulletGraph({ label, delivered, target, comparison, tone = "default" }: Props) {
  const hero = tone === "hero";
  const max = Math.max(target, delivered, 1) * 1.1;
  const pct = (n: number) => `${(n / max) * 100}%`;
  return (
    <figure className="flex flex-col gap-2.5">
      <figcaption className="flex items-baseline justify-between gap-4">
        <span className={cn("text-[13px]", hero ? "text-on-navy-text" : "text-ink-muted")}>{label}</span>
        <span className="text-sm">
          <span className={cn("text-lg font-semibold tabular-nums", hero ? "text-offwhite" : "text-foreground")}>
            {delivered}
          </span>
          <span className={hero ? "text-on-navy-text" : "text-ink-muted"}> {comparison}</span>
        </span>
      </figcaption>
      <div
        className={cn("relative h-2.5 w-full rounded-full", hero ? "bg-on-navy-10" : "bg-navy-07")}
        role="img"
        aria-label={`${label}: ${delivered} delivered ${comparison}`}
      >
        <div
          className={cn("absolute inset-y-0 left-0 min-w-3 rounded-full", hero ? "bg-peach" : "bg-primary")}
          style={{ width: pct(delivered) }}
        />
        <div
          className={cn("absolute -inset-y-1 w-[3px] -translate-x-1/2 rounded-xs", hero ? "bg-offwhite" : "bg-ink")}
          style={{ left: pct(target) }}
        />
      </div>
    </figure>
  );
}
