import { Info, UsersThree, Warning } from "@phosphor-icons/react/dist/ssr";
import { Notice } from "@/components/auth/notice";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { capitalise, formatDayMonth, monthName } from "@/lib/fynix/format";
import type { AgreementsPage } from "@/server/domain/campaign-overview";
import { Card } from "../card";
import { EmptyState } from "../empty-state";
import { AddShareButton, ShareRowActions } from "./agreement-actions";

type Props = {
  page: AgreementsPage;
  campaignId: string;
  supplierName: string;
  timeZone: string;
  now: Date;
  canWrite: boolean;
};

/** The sentence for an over-allocation: allowed, and said plainly so the admin can check it. */
function overSentence(total: number, target: number): string {
  return `Shares add up to ${total} a month, ${total - target} more than the supplier's target of ${target}. This is allowed and shown here so you can check it.`;
}

/** The monthly shares: each agency's share of the supplier's target, the total against the target, and who changed each last. */
export function SharesCard({ page, campaignId, supplierName, timeZone, now, canWrite }: Props) {
  const { shares, summary, options } = page;
  const month = capitalise(monthName(now, timeZone));
  const addButton = canWrite && options.length > 0 ? <AddShareButton campaignId={campaignId} options={options} /> : null;

  return (
    <Card aria-labelledby="shares-heading" className="px-2 pb-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 pt-4 pb-3">
        <h2 id="shares-heading" className="text-value font-semibold">
          Monthly shares
        </h2>
        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-navy-05 px-2 text-[12.5px] font-semibold">{shares.length}</span>
        <p className="min-w-0 flex-1 text-table text-ink-2 max-md:basis-full">Set by {supplierName}. A Fynix admin can change them.</p>
        {addButton}
      </div>

      {summary.overAllocated && summary.supplierMonthlyTarget !== null && (
        <Notice tone="amber" icon={Warning} compact className="mx-2 mb-3">
          {overSentence(summary.totalShares, summary.supplierMonthlyTarget)}
        </Notice>
      )}

      {shares.length === 0 ? (
        <EmptyState icon={UsersThree} title="No shares yet">
          {summary.supplierMonthlyTarget === null
            ? "Shares split the supplier's monthly target between the supplier and its partner agencies. Add the supplier agreement first to compare them with its target."
            : "Shares split the supplier's monthly target between the supplier and its partner agencies."}
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agency</TableHead>
              <TableHead className="text-right">Monthly share</TableHead>
              <TableHead className="text-right max-md:hidden">Delivered in {month}</TableHead>
              <TableHead className="max-md:hidden">Last changed</TableHead>
              <TableHead className="pr-3.5 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shares.map((row) => (
              <TableRow key={row.agencyOrgId}>
                <TableCell className="h-[60px]">
                  <span className="block text-row font-semibold">{row.agencyName}</span>
                  <span className="block text-table text-ink-2">{row.ownBookings ? "Own bookings" : "Partner agency"}</span>
                </TableCell>
                <TableCell className="text-right">{row.monthlyShare}</TableCell>
                <TableCell className="text-right max-md:hidden">
                  <span className="sr-only">Not counted yet</span>
                </TableCell>
                <TableCell className="text-ink-2 max-md:hidden">
                  {row.changedBy === null ? formatDayMonth(row.updatedAt, timeZone) : `${row.changedBy}, Fynix, ${formatDayMonth(row.updatedAt, timeZone)}`}
                </TableCell>
                <TableCell className="pr-3.5 text-right">
                  {canWrite && <ShareRowActions campaignId={campaignId} agency={{ id: row.agencyOrgId, name: row.agencyName, monthlyShare: row.monthlyShare }} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="[&>td]:shadow-none">
              <TableCell className="h-[44px] font-semibold">Total</TableCell>
              <TableCell className="text-right font-semibold">{summary.supplierMonthlyTarget === null ? summary.totalShares : `${summary.totalShares} of ${summary.supplierMonthlyTarget}`}</TableCell>
              <TableCell className="max-md:hidden" />
              <TableCell className="max-md:hidden" />
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      )}

      {shares.length > 0 && summary.supplierMonthlyTarget === null && (
        <p className="mt-2 flex items-start gap-2 px-3.5 pt-2 text-table text-ink-2">
          <Info aria-hidden size={15} className="mt-px shrink-0" />
          There is no supplier agreement yet, so there is no target to compare the total with.
        </p>
      )}
    </Card>
  );
}
