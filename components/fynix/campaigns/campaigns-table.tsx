import { Megaphone } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CampaignRow } from "@/server/domain/campaign-overview";
import { Card } from "../card";
import { EmptyState } from "../empty-state";
import { StatusChip } from "../status-chip";

/** Every campaign: reference, name, client, supplier and status. A row opens the campaign. Below `md` a row is two lines. */
export function CampaignsTable({ rows }: { rows: readonly CampaignRow[] }) {
  if (rows.length === 0) {
    return (
      <Card aria-label="Campaigns">
        <EmptyState icon={Megaphone} title="No campaigns yet">
          Create the first campaign with the New campaign button.
        </EmptyState>
      </Card>
    );
  }
  return (
    <Card aria-labelledby="campaigns-heading" className="px-2 pb-3">
      <div className="flex items-center gap-3 px-3.5 pt-4 pb-3">
        <h2 id="campaigns-heading" className="text-value font-semibold tracking-[-0.005em]">
          All campaigns
        </h2>
        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-navy-05 px-2 text-[12.5px] font-semibold">{rows.length}</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="max-md:hidden">Ref</TableHead>
            <TableHead>Campaign</TableHead>
            <TableHead className="max-md:hidden">Client</TableHead>
            <TableHead className="max-md:hidden">Supplier</TableHead>
            <TableHead className="pr-3.5">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="relative">
              <TableCell className="font-mono text-[12.5px] max-md:hidden">{row.publicRef}</TableCell>
              <TableCell className="max-w-[320px] max-md:h-[68px] max-md:w-full max-md:max-w-0 md:h-[50px]">
                <Link href={`/fynix/campaigns/${row.publicRef}`} className="block truncate rounded-xs text-row font-semibold after:absolute after:inset-0 after:content-['']">
                  {row.name}
                </Link>
                <span className="mt-0.5 block truncate text-table text-ink-2 md:hidden">
                  {row.clientName}, served by {row.supplierName}
                </span>
              </TableCell>
              <TableCell className="max-md:hidden">{row.clientName}</TableCell>
              <TableCell className="max-md:hidden">{row.supplierName}</TableCell>
              <TableCell className="pr-3.5">
                <StatusChip kind="campaign" status={row.status} size="sm" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
