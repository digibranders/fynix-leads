import { cn } from "@/lib/utils";

/** A calendar tile: the day over the month. */
export function DateTile({ date, className }: { date: Date; className?: string }) {
  const day = date.toLocaleDateString("en-GB", { day: "2-digit", timeZone: "UTC" });
  const month = date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return (
    <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-sm bg-navy-05 leading-none", className)}>
      <span className="grid gap-0.5 text-center">
        <b className="text-[14px] font-semibold">{day}</b>
        <i className="text-[10px] font-medium tracking-[0.05em] text-ink-muted uppercase not-italic">{month}</i>
      </span>
    </span>
  );
}

/** A row in a list panel: a leading tile, a title with a muted line, and a trailing value. Highlighted for the next thing to happen. */
export function ListRow({
  leading,
  title,
  sub,
  trailing,
  highlight = false,
}: {
  leading?: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  trailing?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <li className={cn("relative flex items-center gap-3 px-3 py-2.5", highlight && "mx-2 rounded-md bg-selected")}>
      {leading}
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate font-semibold">{title}</span>
        {sub ? <span className="block truncate text-caption text-ink-muted">{sub}</span> : null}
      </span>
      {trailing ? <span className="shrink-0 text-body text-ink-muted">{trailing}</span> : null}
    </li>
  );
}
