import { Scales } from "@phosphor-icons/react/dist/ssr";
import { FormSheet } from "@/components/fynix/forms/form-sheet";
import { EmptyState } from "@/components/kit/empty-state";
import { MarkReviewedForm } from "@/components/leads/fynix-lead-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader, Tonal } from "@/components/kit/panel";
import { Person } from "@/components/kit/person";
import { formatWaiting } from "@/lib/time/age";
import type { RejectionRow } from "@/server/domain/rejection-overview";
import type { RejectionReviewRow } from "@/server/domain/rejection-reviews";

/**
 * Leads a client rejected after the meeting, newest first. Each row shows the client's note in its own words, the client, the campaign, the agency that
 * sent it and how long ago it was rejected. A row opens the lead record, where Fynix (admin or staff) can change the rejection to accepted with a note.
 */
export function RejectionsTable({ rows, now, reviews = {}, emptyText }: { readonly rows: readonly RejectionRow[]; readonly now: Date; /** The coordinator's open requests for a review, by lead id. */ readonly reviews?: Readonly<Record<string, RejectionReviewRow>>; readonly emptyText?: string }) {
  if (rows.length === 0) {
    return (
      <Panel aria-label="Rejections">
        <EmptyState icon={Scales} title="No rejections">
          {emptyText ?? "A lead a client rejects after the meeting shows here with its note. Fynix can change it to accepted."}
        </EmptyState>
      </Panel>
    );
  }
  return (
    <Panel aria-label="Rejections">
      <PanelHeader title="Rejected after the meeting" count={rows.length} />
      <ul className="flex flex-col px-2.5 pb-3">
        {rows.map((row) => {
          const review = reviews[row.leadId];
          return (
          <li key={row.leadId} className="relative flex flex-col gap-3 rounded-md px-3 py-4 shadow-[inset_0_-1px_0_var(--line)] last:shadow-none lg:grid lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)_auto] lg:items-start lg:gap-6">
            <div className="min-w-0">
              <Person name={row.prospectName} href={`/fynix/leads/${row.leadRef}`} sub={row.prospectCompany} />
              {review !== undefined ? (
                <Badge variant="peach" size="sm" className="mt-1.5">
                  Review requested
                </Badge>
              ) : null}
              <p className="mt-1.5 text-caption text-ink-muted">
                <span className="font-mono">{row.leadRef}</span> in {row.campaignName}
              </p>
              <p className="text-caption text-ink-muted">
                {row.clientName}, sent by {row.agencyName}
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Tonal className="min-w-0 py-3">
                <p className="text-caption font-semibold text-ink-muted">Client&apos;s note{row.rejectedByName === null ? "" : `, ${row.rejectedByName}`}</p>
                <p className="mt-0.5 text-body whitespace-pre-line text-ink-2">{row.note === "" ? "No note given" : row.note}</p>
              </Tonal>
              {review !== undefined ? (
                <Tonal className="min-w-0 py-3">
                  <p className="text-caption font-semibold text-ink-muted">Coordinator&apos;s reason for a review{review.requestedByName === null ? "" : `, ${review.requestedByName}`}</p>
                  <p className="mt-0.5 text-body whitespace-pre-line text-ink-2">{review.requestNote}</p>
                </Tonal>
              ) : null}
            </div>
            <div className="flex items-center gap-3 lg:flex-col lg:items-end">
              <p className="text-label font-semibold text-ink-muted">{row.rejectedAt === null ? "Date not recorded" : `${formatWaiting(row.rejectedAt, now)} ago`}</p>
              <FormSheet trigger={<Button type="button" variant="secondary" size="xs">Mark reviewed</Button>} title="Mark as reviewed" description={`Leave the rejection of ${row.prospectName} as it is.`}>
                <MarkReviewedForm leadId={row.leadId} />
              </FormSheet>
            </div>
          </li>
          );
        })}
      </ul>
    </Panel>
  );
}
