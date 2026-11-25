import { Megaphone } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { StatusChip } from "@/components/kit/status-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AgencyCampaignRow } from "@/server/domain/agency-overview";

/** The campaigns an agency holds a share of: the client, the status, its share per month and what it has delivered so far. */
export function AgencyCampaignsPanel({ rows }: { rows: readonly AgencyCampaignRow[] }) {
  return (
    <Panel aria-label="Campaigns">
      <PanelHeader title="Campaigns" count={rows.length} />
      {rows.length === 0 ? (
        <EmptyState icon={Megaphone} title="No campaigns yet">
          An agency gets a share of a campaign from the campaign&apos;s Agreements tab.
        </EmptyState>
      ) : (
        <div className="px-2.5 pb-3">
          <Table>
            <TableHeader>
              <TableRow className="hover:[&>th]:bg-navy-04">
                <TableHead>Campaign</TableHead>
                <TableHead className="max-md:hidden">Status</TableHead>
                <TableHead className="text-right">Share a month</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="relative">
                  <TableCell>
                    <Link href={`/fynix/campaigns/${row.publicRef}`} className="block truncate rounded-xs text-row font-semibold after:absolute after:inset-0 after:content-['']">
                      {row.name}
                    </Link>
                    <span className="block truncate text-caption text-ink-muted">{row.clientName}</span>
                  </TableCell>
                  <TableCell className="max-md:hidden">
                    <StatusChip kind="campaign" status={row.status} size="sm" />
                  </TableCell>
                  <TableCell className="text-right">{row.monthlyShare}</TableCell>
                  <TableCell className="text-right">{row.delivered}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}
