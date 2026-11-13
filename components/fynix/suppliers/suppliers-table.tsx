import { Info, MagnifyingGlass, UsersThree } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { filterSuppliers, filterCounts, supplierSubtitle, suppliersHref, type SupplierFilter } from "@/lib/fynix/suppliers";
import { cn } from "@/lib/utils";
import type { SupplierRow } from "@/server/domain/supplier-overview";
import { Card } from "../card";
import { EmptyState } from "../empty-state";
import { AddSupplierButton } from "./supplier-actions";

type Props = {
  rows: readonly SupplierRow[];
  filter: SupplierFilter;
  query: string;
  selectedRef: string | undefined;
  canWrite: boolean;
};

/** The segmented Active and Archived switch. Plain links, so the filter is in the address and works without JavaScript. */
function FilterSwitch({ filter, counts, query }: { filter: SupplierFilter; counts: Record<SupplierFilter, number>; query: string }) {
  return (
    <nav aria-label="Filter suppliers" className="inline-flex h-[38px] items-center gap-0.5 rounded-full bg-navy-05 p-[3px]">
      {(["active", "archived"] as const).map((option) => (
        <Link
          key={option}
          href={suppliersHref({ status: option, q: query })}
          aria-current={option === filter ? "page" : undefined}
          className={cn(
            "inline-flex h-8 items-center gap-[7px] rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap text-ink-2 transition-[background-color,color] hover:bg-navy-05 max-md:h-8",
            option === filter && "bg-primary font-semibold text-primary-foreground shadow-segment hover:bg-primary",
          )}
        >
          {option === "active" ? "Active" : "Archived"}
          <b className={cn("font-semibold", option === filter ? "text-peach" : "text-ink-2")}>{counts[option]}</b>
        </Link>
      ))}
    </nav>
  );
}

export function SuppliersTable({ rows, filter, query, selectedRef, canWrite }: Props) {
  const counts = filterCounts(rows);
  const shown = filterSuppliers(rows, filter, query);

  if (rows.length === 0) {
    return (
      <Card aria-label="Suppliers">
        <EmptyState
          icon={UsersThree}
          title="No suppliers yet"
          action={canWrite ? <AddSupplierButton /> : undefined}
        >
          {canWrite ? "Add the first supplier, then invite its people." : "A Fynix admin adds suppliers."}
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card aria-labelledby="suppliers-heading" className="px-2 pb-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 px-3.5 pt-4 pb-3">
        <h2 id="suppliers-heading" className="text-value font-semibold tracking-[-0.005em]">
          All suppliers
        </h2>
        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-navy-05 px-2 text-[12.5px] font-semibold">{rows.length}</span>
        <div className="md:ml-auto">
          <FilterSwitch filter={filter} counts={counts} query={query} />
        </div>
        <form action="/fynix/suppliers" role="search" className="relative basis-full md:basis-[280px]">
          {filter === "archived" && <input type="hidden" name="status" value="archived" />}
          <MagnifyingGlass aria-hidden size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" />
          <Input type="search" name="q" defaultValue={query} placeholder="Supplier or agency name" aria-label="Search suppliers" className="h-10 rounded-full pl-10" />
        </form>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={UsersThree} title={query.trim() === "" ? `No ${filter} suppliers` : "No supplier matches"}>
          {query.trim() === "" ? (filter === "archived" ? "Suppliers that are archived show here." : "Every supplier is archived.") : "Try a different name, or clear the search."}
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="max-md:hidden">Ref</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right max-md:hidden">Agencies</TableHead>
              <TableHead className="text-right max-md:hidden">People</TableHead>
              <TableHead className="pr-3.5 text-right">Campaigns</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((row) => {
              const selected = row.publicRef === selectedRef;
              return (
                <TableRow key={row.id} data-state={selected ? "selected" : undefined} className="relative">
                  <TableCell className="font-mono text-[12.5px] max-md:hidden">{row.publicRef}</TableCell>
                  <TableCell className="max-md:h-[68px] md:h-[50px]">
                    <Link
                      href={suppliersHref({ status: filter, q: query, supplier: row.publicRef })}
                      scroll={false}
                      aria-current={selected ? "true" : undefined}
                      className="block rounded-xs text-row font-semibold after:absolute after:inset-0 after:content-['']"
                    >
                      {row.name}
                    </Link>
                    <span className="mt-0.5 block text-table text-ink-2 md:hidden">{supplierSubtitle(row)}</span>
                    {row.inviteWaiting && <span className="mt-0.5 block text-table text-ink-2 max-md:hidden">Invite sent, not accepted yet</span>}
                  </TableCell>
                  <TableCell className="text-right max-md:hidden">{row.agencyCount}</TableCell>
                  <TableCell className="text-right max-md:hidden">{row.peopleCount}</TableCell>
                  <TableCell className="pr-3.5 text-right">{row.campaignCount}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <p className="mt-2 flex items-start gap-2 px-3.5 pt-2 text-table text-ink-2">
        <Info aria-hidden size={15} className="mt-px shrink-0" />
        Partner agencies are added by their supplier. A Fynix admin can add one too.
      </p>
    </Card>
  );
}
