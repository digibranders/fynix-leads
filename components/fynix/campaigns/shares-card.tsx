import { Info, UsersThree, Warning } from "@phosphor-icons/react/dist/ssr";
import { Notice } from "@/components/auth/notice";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { capitalise, formatDayMonth, monthName } from "@/lib/fynix/format";
import { monthInZone } from "@/lib/time/zones";
import type { AgreementsPage } from "@/server/domain/campaign-overview";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { AddShareButton, ShareRowActions } from "./agreement-actions";

type Props = {
  page: AgreementsPage;
  campaignId: string;
  coordinatorName: string;
  timeZone: string;
  now: Date;
  canWrite: boolean;
  /** The campaign's monthly number, so a new share can start from what is left of it. */
  campaignMonthly: number;
};

/** The sentence for an over-allocation: allowed, and said plainly so the admin can check it. */
function overSentence(total: number, target: number): string {
  return `Shares add up to ${total} a month, ${total - target} more than the campaign's target of ${target}. This is allowed and shown here so you can check it.`;
}

/** The monthly shares: each agency's share of the campaign's monthly number, the total against the target, and who changed each last. */
export function SharesCard({ page, campaignId, coordinatorName, timeZone, now, canWrite, campaignMonthly }: Props) {
  const { shares, summary, options } = page;
  const month = capitalise(monthName(now, timeZone));
  const monthKey = monthInZone(now, timeZone);
  const addButton = canWrite && options.length > 0 ? <AddShareButton campaignId={campaignId} options={options} suggested={Math.max(0, campaignMonthly - summary.totalShares)} /> : null;

  return (
    <Panel aria-label="Monthly shares">
      <PanelHeader title="Monthly shares" count={shares.length} action={addButton} />
      <p className="px-5 pb-2 text-body text-ink-muted">Set by {coordinatorName}. A Fynix admin can change them.</p>

      {summary.overAllocated && summary.campaignMonthlyTarget !== null && (
        <Notice tone="amber" icon={Warning} compact className="mx-5 mb-3">
          {overSentence(summary.totalShares, summary.campaignMonthlyTarget)}
        </Notice>
      )}

      {shares.length === 0 ? (
        <EmptyState icon={UsersThree} title="No shares yet">
          {summary.campaignMonthlyTarget === null
            ? "Shares split the campaign's monthly number between the coordinator and its partner agencies. Publish the agreement first to compare them with it."
            : "Shares split the campaign's monthly number between the coordinator and its partner agencies."}
        </EmptyState>
      ) : (
        <div className="px-2.5">
        <Table>
          <TableHeader>
            <TableRow className="hover:[&>th]:bg-navy-04">
              <TableHead>Agency</TableHead>
              <TableHead className="text-right">Monthly share</TableHead>
              <TableHead className="text-right max-md:hidden">Accepted in {month}</TableHead>
              <TableHead className="max-md:hidden">Last changed</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shares.map((row) => (
              <TableRow key={row.agencyOrgId}>
                <TableCell>
                  <span className="block text-row font-semibold">{row.agencyName}</span>
                  <span className="block text-caption text-ink-muted">{row.ownBookings ? "Own bookings" : "Partner agency"}</span>
                </TableCell>
                <TableCell className="text-right">{row.monthlyShare}</TableCell>
                <TableCell className="text-right max-md:hidden">
                  {row.countedByMonth[monthKey] ?? 0}
                </TableCell>
                <TableCell className="text-ink-muted max-md:hidden">
                  {row.changedBy === null ? formatDayMonth(row.updatedAt, timeZone) : `${row.changedBy}, Fynix, ${formatDayMonth(row.updatedAt, timeZone)}`}
                </TableCell>
                <TableCell className="text-right">
                  {canWrite && <ShareRowActions campaignId={campaignId} agency={{ id: row.agencyOrgId, name: row.agencyName, monthlyShare: row.monthlyShare }} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="[&>td]:shadow-none">
              <TableCell className="font-semibold">Total</TableCell>
              <TableCell className="text-right font-semibold">{summary.campaignMonthlyTarget === null ? summary.totalShares : `${summary.totalShares} of ${summary.campaignMonthlyTarget}`}</TableCell>
              <TableCell className="max-md:hidden" />
              <TableCell className="max-md:hidden" />
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
        </div>
      )}

      {shares.length > 0 && summary.campaignMonthlyTarget === null && (
        <p className="flex items-start gap-2 px-5 pt-3 pb-4 text-caption text-ink-muted">
          <Info aria-hidden size={14} className="mt-px shrink-0" />
          There is no agreement yet, so there is no number to compare the total with.
        </p>
      )}
    </Panel>
  );
}
