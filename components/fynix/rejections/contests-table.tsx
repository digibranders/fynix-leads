import { Scales } from "@phosphor-icons/react/dist/ssr";
import { FormSheet } from "@/components/fynix/forms/form-sheet";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel, PanelHeader, Tonal } from "@/components/kit/panel";
import { Person } from "@/components/kit/person";
import { DecideContestForm } from "@/components/leads/fynix-lead-forms";
import { Button } from "@/components/ui/button";
import { formatWaiting } from "@/lib/time/age";
import type { ContestRow } from "@/server/domain/contests";

const OUTCOME_TEXT: Readonly<Record<string, string>> = { held: "meeting held", client_no_show: "client no-show", prospect_no_show: "prospect no-show" };

const WHO: Readonly<Record<string, string>> = { client: "the client", coordinator: "the coordinator", agency: "the agency", fynix: "Fynix" };

/**
 * Outcomes one side recorded and the other contested, oldest contest first. Each row names the outcome in dispute, who recorded it, who contested and why, and
 * opens a form where Fynix names the final outcome with a note. Open to staff.
 */
export function ContestsTable({ rows, now }: { readonly rows: readonly ContestRow[]; readonly now: Date }) {
  if (rows.length === 0) {
    return (
      <Panel aria-label="Contests">
        <EmptyState icon={Scales} title="No contests">
          When the client or the sending team contests a recorded outcome within 48 hours, it waits here for Fynix to decide.
        </EmptyState>
      </Panel>
    );
  }
  return (
    <Panel aria-label="Contests">
      <PanelHeader title="Outcomes in dispute" count={rows.length} />
      <ul className="flex flex-col px-2.5 pb-3">
        {rows.map((row) => (
          <li key={row.leadId} className="relative flex flex-col gap-3 rounded-md px-3 py-4 shadow-[inset_0_-1px_0_var(--line)] last:shadow-none lg:grid lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)_auto] lg:items-start lg:gap-6">
            <div className="min-w-0">
              <Person name={row.prospectName} href={`/fynix/leads/${row.leadRef}`} sub={row.prospectCompany} />
              <p className="mt-1.5 text-caption text-ink-muted">
                <span className="font-mono">{row.leadRef}</span> in {row.campaignName}
              </p>
              <p className="text-caption text-ink-muted">
                {row.clientName}, sent by {row.agencyName}
              </p>
            </div>
            <Tonal className="min-w-0 py-3">
              <p className="text-caption font-semibold text-ink-muted">
                Recorded as {OUTCOME_TEXT[row.outcome] ?? row.outcome} by {WHO[row.recordedByRole ?? ""] ?? "a side"}, contested by {WHO[row.contestedByRole ?? ""] ?? "the other side"}
              </p>
              <p className="mt-0.5 text-body whitespace-pre-line text-ink-2">{row.contestNote === "" ? "No note given" : row.contestNote}</p>
            </Tonal>
            <div className="flex items-center gap-3 lg:flex-col lg:items-end">
              <p className="text-label font-semibold text-ink-muted">{`${formatWaiting(row.contestedAt, now)} ago`}</p>
              <FormSheet trigger={<Button type="button" variant="default" size="xs">Decide</Button>} title="Decide the contest" description={`The outcome of the meeting with ${row.prospectName} is contested.`}>
                <DecideContestForm leadId={row.leadId} contestedOutcome={row.outcome} />
              </FormSheet>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
