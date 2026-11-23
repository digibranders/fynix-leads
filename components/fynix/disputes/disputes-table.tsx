import { Scales } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DisputeRow } from "@/server/domain/dispute-overview";
import { Card } from "../card";
import { EmptyState } from "../empty-state";
import { FormSheet } from "../forms/form-sheet";
import { ResolveDisputeForm } from "../forms/dispute-forms";

export function DisputesTable({ rows, canWrite }: { rows: readonly DisputeRow[]; canWrite: boolean }) {
  if (rows.length === 0) {
    return (
      <Card aria-label="Disputes">
        <EmptyState icon={Scales} title="No open disputes">
          A client can dispute a delivered lead within the dispute window. It shows here until Fynix decides.
        </EmptyState>
      </Card>
    );
  }
  return (
    <Card aria-labelledby="disputes-heading" className="px-2 pb-3">
      <div className="flex items-center gap-3 px-3.5 pt-4 pb-3">
        <h2 id="disputes-heading" className="text-value font-semibold tracking-[-0.005em]">
          Open disputes
        </h2>
        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-navy-05 px-2 text-[12.5px] font-semibold">{rows.length}</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lead</TableHead>
            <TableHead className="max-md:hidden">Campaign</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="pr-3.5 text-right">{canWrite ? "Decision" : "Raised"}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.leadId}>
              <TableCell className="align-top">
                <span className="block text-row font-semibold">{row.prospectName}</span>
                <span className="block text-table text-ink-2">{row.prospectCompany}</span>
                <span className="mt-0.5 block font-mono text-[12.5px] text-ink-muted">{row.leadRef}</span>
              </TableCell>
              <TableCell className="align-top max-md:hidden">
                <span className="block">{row.campaignName}</span>
                <span className="block text-table text-ink-2">{row.clientBrandName}</span>
              </TableCell>
              <TableCell className="max-w-[28rem] align-top whitespace-normal">{row.reason === "" ? "No reason given" : row.reason}</TableCell>
              <TableCell className="pr-3.5 text-right align-top">
                {canWrite ? (
                  <FormSheet trigger={<Button size="sm">Decide</Button>} title="Decide this dispute" description={`${row.prospectName}, ${row.prospectCompany}`}>
                    <ResolveDisputeForm leadId={row.leadId} />
                  </FormSheet>
                ) : (
                  <span className="text-table text-ink-2">{row.disputedAt === null ? "" : row.disputedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
