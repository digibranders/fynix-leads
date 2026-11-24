import { Megaphone } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { StatusChip } from "@/components/kit/status-chip";
import { SearchForm, Toolbar } from "@/components/kit/toolbar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CampaignRow } from "@/server/domain/campaign-overview";

/** Every campaign: reference, name, client, supplier and status, with a search. A row opens the campaign. Below `md` a row is two lines. */
export function CampaignsTable({ rows, query = "" }: { rows: readonly CampaignRow[]; query?: string }) {
  if (rows.length === 0) {
    return (
      <Panel aria-label="Campaigns">
        <EmptyState icon={Megaphone} title="No campaigns yet">
          Create the first campaign with the New campaign button.
        </EmptyState>
      </Panel>
    );
  }
  const needle = query.trim().toLowerCase();
  const shown =
    needle === ""
      ? rows
      : rows.filter((row) => [row.name, row.publicRef, row.clientName, row.supplierName].some((text) => text.toLowerCase().includes(needle)));

  return (
    <Panel aria-label="Campaigns">
      <PanelHeader title="All campaigns" count={rows.length} />
      <Toolbar trailing={`${shown.length} ${shown.length === 1 ? "campaign" : "campaigns"}`}>
        <SearchForm defaultValue={query} placeholder="Campaign, client or supplier" />
      </Toolbar>
      {shown.length === 0 ? (
        <EmptyState icon={Megaphone} title="No campaign matches">
          Try a different name, or clear the search.
        </EmptyState>
      ) : (
        <div className="px-2.5">
          <Table>
            <TableHeader>
              <TableRow className="hover:[&>th]:bg-navy-04">
                <TableHead className="max-md:hidden">Ref</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead className="max-md:hidden">Client</TableHead>
                <TableHead className="max-lg:hidden">Supplier</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => (
                <TableRow key={row.id} className="relative">
                  <TableCell className="font-mono text-caption text-ink-2 max-md:hidden">{row.publicRef}</TableCell>
                  <TableCell className="max-w-[320px] max-md:w-full max-md:max-w-0">
                    <Link href={`/fynix/campaigns/${row.publicRef}`} className="block truncate rounded-xs text-row font-semibold after:absolute after:inset-0 after:content-['']">
                      {row.name}
                    </Link>
                    <span className="block truncate text-caption text-ink-muted md:hidden">
                      {row.clientName}, served by {row.supplierName}
                    </span>
                  </TableCell>
                  <TableCell className="max-md:hidden">{row.clientName}</TableCell>
                  <TableCell className="max-lg:hidden">{row.supplierName}</TableCell>
                  <TableCell>
                    <StatusChip kind="campaign" status={row.status} size="sm" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="h-3" />
    </Panel>
  );
}
