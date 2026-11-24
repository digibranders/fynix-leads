import { Buildings } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { SearchForm, Toolbar } from "@/components/kit/toolbar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { countOf } from "@/lib/fynix/format";
import type { ClientRow } from "@/server/domain/client-overview";
import { AddClientButton } from "./client-actions";

export function ClientsTable({ rows, query, canWrite }: { rows: readonly ClientRow[]; query: string; canWrite: boolean }) {
  const needle = query.trim().toLowerCase();
  const shown = needle === "" ? rows : rows.filter((row) => row.name.toLowerCase().includes(needle) || row.brandName.toLowerCase().includes(needle));

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
      <Toolbar trailing={`${shown.length} ${shown.length === 1 ? "client" : "clients"}`}>
        <SearchForm defaultValue={query} placeholder="Client or brand name" />
      </Toolbar>
      {shown.length === 0 ? (
        <EmptyState icon={Buildings} title="No client matches">
          Try a different name, or clear the search.
        </EmptyState>
      ) : (
        <div className="px-2.5 pb-3">
          <Table>
            <TableHeader>
              <TableRow className="hover:[&>th]:bg-navy-04">
                <TableHead className="max-md:hidden">Ref</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="max-md:hidden">Brand</TableHead>
                <TableHead className="text-right max-md:hidden">People</TableHead>
                <TableHead className="text-right">Campaigns</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-caption text-ink-2 max-md:hidden">{row.publicRef}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <span className="text-row font-semibold">{row.name}</span>
                      {row.status === "archived" ? <Badge variant="quiet" size="sm">Archived</Badge> : null}
                    </span>
                    <span className="block text-caption text-ink-muted md:hidden">{countOf(row.peopleCount, "person", "people")}</span>
                  </TableCell>
                  <TableCell className="max-md:hidden">{row.brandName}</TableCell>
                  <TableCell className="text-right max-md:hidden">{row.peopleCount}</TableCell>
                  <TableCell className="text-right">{row.campaignCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}
