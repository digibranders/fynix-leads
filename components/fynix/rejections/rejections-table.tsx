import { Scales } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel, PanelHeader, Tonal } from "@/components/kit/panel";
import { Person } from "@/components/kit/person";
import { formatWaiting } from "@/lib/time/age";
import type { RejectionRow } from "@/server/domain/rejection-overview";

/**
 * Leads a client rejected after the meeting, newest first. Each row shows the client's note in its own words, the client, the campaign, the agency that
 * sent it and how long ago it was rejected. A row opens the lead record, where Fynix (admin or staff) can change the rejection to accepted with a note.
 */
export function RejectionsTable({ rows, now }: { readonly rows: readonly RejectionRow[]; readonly now: Date }) {
  if (rows.length === 0) {
    return (
      <Panel aria-label="Rejections">
        <EmptyState icon={Scales} title="No rejections">
          A lead a client rejects after the meeting shows here with its note. Fynix can change it to accepted.
        </EmptyState>
      </Panel>
    );
  }
  return (
    <Panel aria-label="Rejections">
      <PanelHeader title="Rejected after the meeting" count={rows.length} />
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
              <p className="text-caption font-semibold text-ink-muted">Client&apos;s note{row.rejectedByName === null ? "" : `, ${row.rejectedByName}`}</p>
              <p className="mt-0.5 text-body whitespace-pre-line text-ink-2">{row.note === "" ? "No note given" : row.note}</p>
            </Tonal>
            <p className="text-label font-semibold text-ink-muted lg:justify-self-end">{row.rejectedAt === null ? "Date not recorded" : `${formatWaiting(row.rejectedAt, now)} ago`}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
