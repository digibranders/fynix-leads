import { Warning } from "@phosphor-icons/react/dist/ssr";
import { formatInZone, isOutsideWorkingHours } from "@/lib/time/zones";

type Props = {
  at: Date;
  viewerZone: string;
  other?: { zone: string; label: string };
};

/** Spec section 9: the viewer's time first, the other side's time under it, a warning outside working hours. */
export function TimeInZones({ at, viewerZone, other }: Props) {
  const offHours = isOutsideWorkingHours(at, viewerZone) || (other ? isOutsideWorkingHours(at, other.zone) : false);
  return (
    <div className="flex flex-col gap-0.5">
      <time dateTime={at.toISOString()} className="font-medium text-foreground">
        {formatInZone(at, viewerZone)}
      </time>
      {other && (
        <span className="text-xs text-ink-muted">
          {formatInZone(at, other.zone)} for {other.label}
        </span>
      )}
      {offHours && (
        <span className="inline-flex items-center gap-1 text-xs text-amber-text">
          <Warning aria-hidden size={12} weight="fill" />
          Outside working hours for one side
        </span>
      )}
    </div>
  );
}
