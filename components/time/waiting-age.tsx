import { formatWaiting, isOverdue } from "@/lib/time/age";
import { cn } from "@/lib/utils";

export function WaitingAge({ since, now }: { since: Date; now: Date }) {
  const overdue = isOverdue(since, now);
  return (
    <span
      className={cn("text-[13px] tabular-nums", overdue ? "font-semibold text-red-text" : "text-ink-muted")}
      title={overdue ? "Waiting more than 24 hours" : undefined}
    >
      {formatWaiting(since, now)}
    </span>
  );
}
