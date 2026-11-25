import { ClockCounterClockwise, Handshake } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_COUNTING_RULES } from "@/lib/fynix/campaign-terms";
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
  /** A closed campaign takes no new version. */
  closed?: boolean;
  /** What a first version starts from: the campaign's own numbers. */
  suggested: { readonly monthlyTarget: number; readonly totalTarget: number };
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
export function AgreementCard({ side, withName, campaignId, timeZone, canWrite, closed = false, suggested }: Props) {
  const title = "Agreement";
  const { current, previous } = side;

  if (current === null) {
    return (
      <Panel aria-label={title}>
        <PanelHeader title={title} />
        <EmptyState icon={Handshake} title="No agreement yet" action={canWrite && !closed ? <NewVersionButton campaignId={campaignId} first defaults={{ ...suggested, rules: DEFAULT_COUNTING_RULES, notes: "" }} /> : undefined}>
          {canWrite ? `Write down what Fynix has agreed with ${withName}.` : "A Fynix admin writes the agreement."}
        </EmptyState>
      </Panel>
    );
  }

  const clientAcceptance = current.accepted.find((entry) => entry.side === "client");
  const coordinatorAcceptance = current.accepted.find((entry) => entry.side === "supplier");
  const bothAccepted = clientAcceptance !== undefined && coordinatorAcceptance !== undefined;
  const sentence = `Between ${withName}. Sent on ${formatWeekdayDate(current.createdAt, timeZone)}.`;
  const sideLine = (label: string, acceptance: typeof clientAcceptance): string =>
    acceptance === undefined ? `${label}: waiting` : `${label}: accepted by ${acceptance.name} on ${formatWeekdayDate(acceptance.at, timeZone)}`;

  return (
    <Panel aria-label={title} className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-1 text-section font-semibold tracking-[-0.01em]">{title}</h2>
        <Badge variant="quiet" className="font-mono font-medium">
          Version {current.version}
        </Badge>
        <StatusChip kind="agreement" status={bothAccepted ? "accepted" : "waiting"} />
      </div>
      <div className="flex flex-col gap-0.5 text-body text-ink-muted">
        <p>{sentence}</p>
        <p>{sideLine("Client", clientAcceptance)}</p>
        <p>{sideLine("Coordinator", coordinatorAcceptance)}</p>
        {side.inForceVersion !== null ? <p>Version {side.inForceVersion} stays in force until both sides accept this one.</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Per month" value={current.monthlyTarget} unit="meetings" />
        <Tile label="In total" value={current.totalTarget} unit={monthsLine(current.monthlyTarget, current.totalTarget)} />
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
        {canWrite && !closed && (
          <NewVersionButton
            campaignId={campaignId}
            defaults={{ monthlyTarget: current.monthlyTarget, totalTarget: current.totalTarget, rules: current.rules, notes: current.notes }}
          />
        )}
      </div>
      {side.history.length > 0 ? (
        <div className="pt-3 shadow-[inset_0_1px_0_var(--line)]">
          <h3 className="text-label font-semibold text-ink">History</h3>
          <ul className="mt-2 flex flex-col gap-1.5 text-table text-ink-2">
            {side.history.map((row) => (
              <li key={row.version} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span>
                  Version {row.version}: {row.monthlyTarget} a month, {row.totalTarget} in total
                </span>
                <span className="text-ink-muted">
                  {formatDayMonth(row.createdAt, timeZone)}, {row.acceptedByBoth ? "accepted by both sides" : "not accepted by both sides"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}
