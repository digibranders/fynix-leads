import Link from "next/link";
import { Buildings } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { TabNav } from "@/components/kit/tab-nav";
import { SearchForm, Toolbar } from "@/components/kit/toolbar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { campaignCountsText } from "@/lib/fynix/campaign-counts";
import { countOf } from "@/lib/fynix/format";
import { filterCounts, type SupplierFilter } from "@/lib/fynix/suppliers";
import type { ClientRow } from "@/server/domain/client-overview";
import { AddClientButton } from "./client-actions";

/** The Clients list: Active and Archived as link tabs (the filter is in the address), a search, and a row per client that opens its record. */
export function ClientsTable({ rows, query, canWrite, filter = "active" }: { rows: readonly ClientRow[]; query: string; canWrite: boolean; filter?: SupplierFilter }) {
  const needle = query.trim().toLowerCase();
  const counts = filterCounts(rows);
  const shown = rows.filter((row) => row.status === filter && (needle === "" || row.name.toLowerCase().includes(needle)));
  const hrefFor = (status: SupplierFilter) => {
    const params = new URLSearchParams();
    if (status === "archived") params.set("status", "archived");
    if (needle !== "") params.set("q", query.trim());
    const text = params.toString();
    return text === "" ? "/fynix/clients" : `/fynix/clients?${text}`;
  };

  if (rows.length === 0) {
    return (
      <Panel aria-label="Clients">
        <EmptyState icon={Buildings} title="No clients yet" action={canWrite ? <AddClientButton /> : undefined}>
          {canWrite ? "Add the first client, then create its campaign." : "A Fynix admin adds clients."}
        </EmptyState>
      </Panel>
    );
  }

  return (
    <Panel aria-label="Clients">
      <PanelHeader title="All clients" count={rows.length} />
      <TabNav
        label="Filter clients"
        items={(["active", "archived"] as const).map((option) => ({ label: option === "active" ? "Active" : "Archived", href: hrefFor(option), count: counts[option], active: option === filter }))}
      />
      <Toolbar trailing={`${shown.length} ${shown.length === 1 ? "client" : "clients"}`}>
        <SearchForm defaultValue={query} placeholder="Client name" hidden={{ status: filter === "archived" ? "archived" : undefined }} />
      </Toolbar>
      {shown.length === 0 ? (
        <EmptyState icon={Buildings} title={needle === "" ? `No ${filter} clients` : "No client matches"}>
          {needle === "" ? (filter === "archived" ? "Clients that are archived show here." : "Every client is archived.") : "Try a different name, or clear the search."}
        </EmptyState>
      ) : (
        <div className="px-2.5 pb-3">
          <Table>
            <TableHeader>
              <TableRow className="hover:[&>th]:bg-navy-04">
                <TableHead className="max-md:hidden">Ref</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="text-right max-md:hidden">People</TableHead>
                <TableHead className="text-right">Campaigns</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => (
                <TableRow key={row.id} className="relative">
                  <TableCell className="font-mono text-caption text-ink-2 max-md:hidden">{row.publicRef}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <Link href={`/fynix/clients/${row.publicRef}`} className="truncate rounded-xs text-row font-semibold after:absolute after:inset-0 after:content-['']">
                        {row.name}
                      </Link>
                      {row.status === "archived" ? <Badge variant="quiet" size="sm">Archived</Badge> : null}
                    </span>
                    {row.contactEmail === null ? null : <span className="block truncate text-caption text-ink-muted max-md:hidden">{row.contactEmail}</span>}
                    <span className="block text-caption text-ink-muted md:hidden">{countOf(row.peopleCount, "person", "people")}</span>
                  </TableCell>
                  <TableCell className="text-right max-md:hidden">{row.peopleCount}</TableCell>
                  <TableCell className="text-right">{campaignCountsText(row.campaignCounts)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}
