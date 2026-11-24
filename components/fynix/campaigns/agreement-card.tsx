import { ClockCounterClockwise, Handshake } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { countOf, formatDayMonth, formatWeekdayDate } from "@/lib/fynix/format";
import type { AgreementSideView } from "@/server/domain/campaign-overview";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { StatusChip } from "@/components/kit/status-chip";
import { NewVersionButton } from "./agreement-actions";

type Props = {
  side: AgreementSideView;
  /** The name of the organisation the agreement is with. */
  withName: string;
  campaignId: string;
  timeZone: string;
  canWrite: boolean;
};

function Tile({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="min-w-0 rounded-md bg-tonal p-3.5">
      <p className="text-caption font-semibold text-ink-muted">{label}</p>
      <p className="mt-0.5 text-figure font-semibold tracking-figure max-sm:text-title">{value}</p>
      <p className="text-caption text-ink-muted">{unit}</p>
    </div>
  );
}

/** "over 6 months" when the total is a whole number of months of the monthly figure; otherwise nothing, rather than a rounded guess. */
function monthsLine(monthly: number, total: number): string {
  return monthly > 0 && total % monthly === 0 ? `over ${countOf(total / monthly, "month", "months")}` : "meetings";
}

/** One party's agreement: the version in force, who accepted it, the three numbers, the counting rules in words and the history line. */
export function AgreementCard({ side, withName, campaignId, timeZone, canWrite }: Props) {
  const title = side.party === "client" ? "Client agreement" : "Supplier agreement";
  const { current, previous } = side;

  if (current === null) {
    return (
      <Panel aria-label={title}>
        <PanelHeader title={title} />
        <EmptyState icon={Handshake} title="No agreement yet" action={canWrite ? <NewVersionButton campaignId={campaignId} party={side.party} defaults={null} /> : undefined}>
          {canWrite ? `Write down what Fynix has agreed with ${withName}.` : "A Fynix admin writes the agreement."}
        </EmptyState>
      </Panel>
    );
  }

  const first = current.accepted[0];
  const extra = current.accepted.length - 1;
  const sentence =
    first === undefined
      ? `Between Fynix and ${withName}. Sent on ${formatWeekdayDate(current.createdAt, timeZone)}, not accepted yet.`
      : `Between Fynix and ${withName}. Accepted by ${first.name}${extra > 0 ? ` and ${countOf(extra, "other", "others")}` : ""} on ${formatWeekdayDate(first.at, timeZone)}.`;

  return (
    <Panel aria-label={title} className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-1 text-section font-semibold tracking-[-0.01em]">{title}</h2>
        <Badge variant="quiet" className="font-mono font-medium">
          Version {current.version}
        </Badge>
        <StatusChip kind="agreement" status={first === undefined ? "waiting" : "accepted"} />
      </div>
      <p className="text-body text-ink-muted">{sentence}</p>
      <div className="grid grid-cols-3 gap-3">
        <Tile label="Per month" value={current.monthlyTarget} unit="meetings" />
        <Tile label="In total" value={current.totalTarget} unit={monthsLine(current.monthlyTarget, current.totalTarget)} />
        <Tile label="Dispute window" value={current.disputeWindowHours} unit="hours" />
      </div>
      <div>
        <p className="text-body whitespace-pre-line text-ink-2">{current.rules === "" ? "No counting rules are written for this version." : current.rules}</p>
        {current.notes !== "" && <p className="mt-2 text-body whitespace-pre-line text-ink-2">{current.notes}</p>}
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <p className="flex min-w-0 items-start gap-2 text-caption text-ink-muted">
          <ClockCounterClockwise aria-hidden size={16} className="mt-px shrink-0" />
          {previous === null
            ? "No earlier versions"
            : `Version ${previous.version} published ${formatDayMonth(previous.createdAt, timeZone)}, superseded ${formatDayMonth(previous.supersededAt, timeZone)}`}
        </p>
        {canWrite && (
          <NewVersionButton
            campaignId={campaignId}
            party={side.party}
            defaults={{ monthlyTarget: current.monthlyTarget, totalTarget: current.totalTarget, disputeWindowHours: current.disputeWindowHours, rules: current.rules, notes: current.notes }}
          />
        )}
      </div>
    </Panel>
  );
}
