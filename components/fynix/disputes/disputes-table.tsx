import { Scales } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel, PanelHeader, Tonal } from "@/components/kit/panel";
import { Person } from "@/components/kit/person";
import { When } from "@/components/kit/when";
import { Button } from "@/components/ui/button";
import type { DisputeRow } from "@/server/domain/dispute-overview";
import { FormSheet } from "../forms/form-sheet";
import { ResolveDisputeForm } from "../forms/dispute-forms";

/**
 * The open disputes as a list, oldest first. Each shows the lead, where it came from, the client's reason in their own words and
 * when it was raised. An admin gets one labelled action per dispute; staff read only.
 */
export function DisputesTable({ rows, canWrite }: { rows: readonly DisputeRow[]; canWrite: boolean }) {
  if (rows.length === 0) {
    return (
      <Panel aria-label="Disputes">
        <EmptyState icon={Scales} title="No open disputes">
          A client can dispute a delivered lead within the dispute window. It shows here until Fynix decides.
        </EmptyState>
      </Panel>
    );
  }
  return (
    <Panel aria-label="Open disputes">
      <PanelHeader title="Open disputes" count={rows.length} />
      <ul className="flex flex-col px-2.5 pb-3">
        {rows.map((row) => (
          <li key={row.leadId} className="flex flex-col gap-3 rounded-md px-3 py-4 shadow-[inset_0_-1px_0_var(--line)] last:shadow-none lg:grid lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)_auto] lg:items-start lg:gap-6">
            <div className="min-w-0">
              <Person name={row.prospectName} sub={row.prospectCompany} />
              <p className="mt-1.5 text-caption text-ink-muted">
                <span className="font-mono">{row.leadRef}</span> in {row.campaignName}, {row.clientBrandName}
              </p>
            </div>
            <Tonal className="min-w-0 py-3">
              <p className="text-caption font-semibold text-ink-muted">
                Reason{row.disputedAt === null ? "" : <>, raised <When at={row.disputedAt} style="day" /></>}
              </p>
              <p className="mt-0.5 text-body whitespace-pre-line text-ink-2">{row.reason === "" ? "No reason given" : row.reason}</p>
            </Tonal>
            <div className="lg:justify-self-end">
              {canWrite ? (
                <FormSheet trigger={<Button variant="secondary">Decide dispute</Button>} title="Decide this dispute" description={`${row.prospectName}, ${row.prospectCompany}`}>
                  <ResolveDisputeForm leadId={row.leadId} />
                </FormSheet>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
