import { formatWaiting, isOverdue } from "@/lib/time/age";
import { cn } from "@/lib/utils";

export function WaitingAge({ since, now }: { since: Date; now: Date }) {
  const overdue = isOverdue(since, now);
  return (
    <span
      className={cn("text-table tabular-nums", overdue ? "font-semibold text-tone-pending" : "text-muted-foreground")}
      title={overdue ? "Waiting more than 24 hours" : undefined}
    >
      {formatWaiting(since, now)}
    </span>
  );
}
