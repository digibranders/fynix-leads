type Props = { label: string; delivered: number; target: number; comparison: string };

export function BulletGraph({ label, delivered, target, comparison }: Props) {
  const max = Math.max(target, delivered, 1) * 1.1;
  const pct = (n: number) => `${(n / max) * 100}%`;
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between gap-4">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm">
          <span className="text-lg font-semibold tabular-nums text-foreground">{delivered}</span>
          <span className="text-muted-foreground"> {comparison}</span>
        </span>
      </figcaption>
      <div
        className="relative h-2.5 w-full rounded-sm bg-[var(--gray-3)]"
        role="img"
        aria-label={`${label}: ${delivered} delivered ${comparison}`}
      >
        <div className="absolute inset-y-0 left-0 rounded-sm bg-[var(--gray-5)]" style={{ width: pct(target) }} />
        <div className="absolute inset-y-[3px] left-0 rounded-[2px] bg-primary" style={{ width: pct(delivered) }} />
        <div className="absolute -inset-y-1 w-0.5 bg-foreground" style={{ left: pct(target) }} />
      </div>
    </figure>
  );
}
