import { Buildings, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { countOf } from "@/lib/fynix/format";
import type { ClientRow } from "@/server/domain/client-overview";
import { Card } from "../card";
import { EmptyState } from "../empty-state";
import { AddClientButton } from "./client-actions";

export function ClientsTable({ rows, query, canWrite }: { rows: readonly ClientRow[]; query: string; canWrite: boolean }) {
  const needle = query.trim().toLowerCase();
  const shown = needle === "" ? rows : rows.filter((row) => row.name.toLowerCase().includes(needle) || row.brandName.toLowerCase().includes(needle));

  if (rows.length === 0) {
    return (
      <Card aria-label="Clients">
        <EmptyState icon={Buildings} title="No clients yet" action={canWrite ? <AddClientButton /> : undefined}>
          {canWrite ? "Add the first client, then create its campaign." : "A Fynix admin adds clients."}
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card aria-labelledby="clients-heading" className="px-2 pb-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 px-3.5 pt-4 pb-3">
        <h2 id="clients-heading" className="text-value font-semibold tracking-[-0.005em]">
          All clients
        </h2>
        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-navy-05 px-2 text-[12.5px] font-semibold">{rows.length}</span>
        <form action="/fynix/clients" role="search" className="relative basis-full md:ml-auto md:basis-[280px]">
          <MagnifyingGlass aria-hidden size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" />
          <Input type="search" name="q" defaultValue={query} placeholder="Client or brand name" aria-label="Search clients" className="h-10 rounded-full pl-10" />
        </form>
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={Buildings} title="No client matches">
          Try a different name, or clear the search.
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="max-md:hidden">Ref</TableHead>
              <TableHead>Client</TableHead>
              <TableHead className="max-md:hidden">Brand</TableHead>
              <TableHead className="text-right max-md:hidden">People</TableHead>
              <TableHead className="pr-3.5 text-right">Campaigns</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-[12.5px] max-md:hidden">{row.publicRef}</TableCell>
                <TableCell className="md:h-[50px]">
                  <span className="text-row font-semibold">{row.name}</span>
                  {row.status === "archived" && <Badge variant="quiet" className="ml-2">Archived</Badge>}
                  <span className="mt-0.5 block text-table text-ink-2 md:hidden">{countOf(row.peopleCount, "person", "people")}</span>
                </TableCell>
                <TableCell className="max-md:hidden">{row.brandName}</TableCell>
                <TableCell className="text-right max-md:hidden">{row.peopleCount}</TableCell>
                <TableCell className="pr-3.5 text-right">{row.campaignCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
