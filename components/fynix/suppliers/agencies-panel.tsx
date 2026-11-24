import { UsersThree } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SupplierDetail } from "@/server/domain/supplier-overview";
import { AddAgencyButton } from "./supplier-actions";

/** The partner agencies of a coordinator, with their people and campaign shares. An admin can add one while the coordinator is active. */
export function AgenciesPanel({ supplier, canWrite }: { supplier: SupplierDetail; canWrite: boolean }) {
  const canAdd = canWrite && supplier.status === "active";
  return (
    <Panel aria-label="Partner agencies">
      <PanelHeader title="Partner agencies" count={supplier.agencies.length} action={canAdd ? <AddAgencyButton supplierId={supplier.id} supplierName={supplier.name} /> : null} />
      {supplier.agencies.length === 0 ? (
        <EmptyState icon={UsersThree} title="No partner agencies">
          The coordinator&apos;s own people submit the leads until an agency is added.
        </EmptyState>
      ) : (
        <div className="px-2.5 pb-3">
          <Table>
            <TableHeader>
              <TableRow className="hover:[&>th]:bg-navy-04">
                <TableHead className="max-md:hidden">Ref</TableHead>
                <TableHead>Agency</TableHead>
                <TableHead className="text-right">People</TableHead>
                <TableHead className="text-right">Campaigns</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {supplier.agencies.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-caption text-ink-2 max-md:hidden">{row.publicRef}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <span className="text-row font-semibold">{row.name}</span>
                      {row.status === "archived" ? (
                        <Badge variant="quiet" size="sm">
                          Archived
                        </Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{row.peopleCount}</TableCell>
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
