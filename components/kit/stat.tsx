import { cn } from "@/lib/utils";

/** A thin trend line. Decorative: the figure beside it carries the number, so it is hidden from assistive tech. */
export function Sparkline({ points, className }: { points: readonly number[]; className?: string }) {
  const width = 84;
  const height = 28;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const path = points
    .map((value, index) => `${(index * step).toFixed(1)},${(height - 3 - ((value - min) / span) * (height - 6)).toFixed(1)}`)
    .join(" ");
  return (
    <svg aria-hidden width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("shrink-0", className)}>
      <polyline points={path} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const TREND_TONE = {
  neutral: "text-ink-2",
  blue: "text-blue-solid",
  teal: "text-teal-solid",
  amber: "text-amber-solid",
  red: "text-red-solid",
  green: "text-green-solid",
} as const;

/** A small figure card: a label, one number, a muted foot line, and an optional trend. Links to where the number comes from when `href` is given. */
export function MiniStat({
  label,
  value,
  foot,
  trend,
  tone = "neutral",
  className,
}: {
  label: string;
  value: React.ReactNode;
  foot?: React.ReactNode;
  trend?: readonly number[];
  tone?: keyof typeof TREND_TONE;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 rounded-lg bg-surface p-5 shadow-raised", className)}>
      <div className="min-w-0">
        <p className="text-label font-semibold text-ink-2">{label}</p>
        <p className="mt-1 text-figure font-semibold tracking-figure">{value}</p>
        {foot ? <p className="mt-0.5 text-caption text-ink-muted">{foot}</p> : null}
      </div>
      {trend && trend.length > 1 ? <Sparkline points={trend} className={TREND_TONE[tone]} /> : null}
    </div>
  );
}

/** A progress bar: a value out of a total. `onNavy` for the hero card. It states the figures in words for assistive tech. */
export function Meter({
  value,
  max,
  label,
  onNavy = false,
  className,
}: {
  value: number;
  max: number;
  label: string;
  onNavy?: boolean;
  className?: string;
}) {
  const share = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("h-1.5 overflow-hidden rounded-full", onNavy ? "bg-on-navy-16" : "bg-navy-08", className)}
    >
      <div className={cn("h-full rounded-full", onNavy ? "bg-peach" : "bg-navy")} style={{ width: `${share}%` }} />
    </div>
  );
}
