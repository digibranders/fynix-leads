import { Hint } from "@/components/ui/hint";
import { formatWaiting, isOverdue } from "@/lib/time/age";
import { cn } from "@/lib/utils";

export function WaitingAge({ since, now }: { since: Date; now: Date }) {
  const overdue = isOverdue(since, now);
  const age = (
    <span className={cn("text-[13px] tabular-nums", overdue ? "font-semibold text-red-text" : "text-ink-muted")}>
      {formatWaiting(since, now)}
    </span>
  );
  return overdue ? <Hint label="Waiting more than 24 hours">{age}</Hint> : age;
}
