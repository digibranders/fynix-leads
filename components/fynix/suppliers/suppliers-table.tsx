import { Info, UsersThree } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { TabNav } from "@/components/kit/tab-nav";
import { SearchForm, Toolbar } from "@/components/kit/toolbar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { filterSuppliers, filterCounts, supplierSubtitle, suppliersHref, type SupplierFilter } from "@/lib/fynix/suppliers";
import type { SupplierRow } from "@/server/domain/supplier-overview";
import { AddSupplierButton } from "./supplier-actions";

type Props = {
  rows: readonly SupplierRow[];
  filter: SupplierFilter;
  query: string;
  selectedRef: string | undefined;
  canWrite: boolean;
};

/** The suppliers list: Active and Archived as link tabs (the filter is in the address), a search, and a row per supplier that opens its record. */
export function SuppliersTable({ rows, filter, query, selectedRef, canWrite }: Props) {
  const counts = filterCounts(rows);
  const shown = filterSuppliers(rows, filter, query);

  if (rows.length === 0) {
    return (
      <Panel aria-label="Suppliers">
        <EmptyState icon={UsersThree} title="No suppliers yet" action={canWrite ? <AddSupplierButton /> : undefined}>
          {canWrite ? "Add the first supplier, then invite its people." : "A Fynix admin adds suppliers."}
        </EmptyState>
      </Panel>
    );
  }

  return (
    <Panel aria-label="Suppliers">
      <PanelHeader title="All suppliers" count={rows.length} />
      <TabNav
        label="Filter suppliers"
        items={(["active", "archived"] as const).map((option) => ({
          label: option === "active" ? "Active" : "Archived",
          href: suppliersHref({ status: option, q: query }),
          count: counts[option],
          active: option === filter,
        }))}
      />
      <Toolbar trailing={`${shown.length} ${shown.length === 1 ? "supplier" : "suppliers"}`}>
        <SearchForm defaultValue={query} placeholder="Supplier or agency name" hidden={{ status: filter === "archived" ? "archived" : undefined }} />
      </Toolbar>

      {shown.length === 0 ? (
        <EmptyState icon={UsersThree} title={query.trim() === "" ? `No ${filter} suppliers` : "No supplier matches"}>
          {query.trim() === "" ? (filter === "archived" ? "Suppliers that are archived show here." : "Every supplier is archived.") : "Try a different name, or clear the search."}
        </EmptyState>
      ) : (
        <div className="px-2.5">
          <Table>
            <TableHeader>
              <TableRow className="hover:[&>th]:bg-navy-04">
                <TableHead className="max-md:hidden">Ref</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right max-md:hidden">Agencies</TableHead>
                <TableHead className="text-right max-md:hidden">People</TableHead>
                <TableHead className="text-right">Campaigns</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => {
                const selected = row.publicRef === selectedRef;
                return (
                  <TableRow key={row.id} data-state={selected ? "selected" : undefined} className="relative">
                    <TableCell className="font-mono text-caption text-ink-2 max-md:hidden">{row.publicRef}</TableCell>
                    <TableCell className="max-md:max-w-0 max-md:w-full">
                      <Link
                        href={suppliersHref({ status: filter, q: query, supplier: row.publicRef })}
                        scroll={false}
                        aria-current={selected ? "true" : undefined}
                        className="block truncate rounded-xs text-row font-semibold after:absolute after:inset-0 after:content-['']"
                      >
                        {row.name}
                      </Link>
                      <span className="block truncate text-caption text-ink-muted md:hidden">{supplierSubtitle(row)}</span>
                      {row.inviteWaiting ? <span className="block text-caption text-ink-muted max-md:hidden">Invite sent, not accepted yet</span> : null}
                    </TableCell>
                    <TableCell className="text-right max-md:hidden">{row.agencyCount}</TableCell>
                    <TableCell className="text-right max-md:hidden">{row.peopleCount}</TableCell>
                    <TableCell className="text-right">{row.campaignCount}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="flex items-start gap-2 px-5 pt-3 pb-4 text-caption text-ink-muted">
        <Info aria-hidden size={14} className="mt-px shrink-0" />
        Partner agencies are added by their supplier. A Fynix admin can add one too.
      </p>
    </Panel>
  );
}
