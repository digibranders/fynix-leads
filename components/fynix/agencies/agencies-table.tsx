import { Handshake } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { TabNav } from "@/components/kit/tab-nav";
import { SearchForm, Toolbar } from "@/components/kit/toolbar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { agenciesHref, agencySubtitle, filterAgencies } from "@/lib/fynix/agencies";
import { campaignCountsText } from "@/lib/fynix/campaign-counts";
import { filterCounts, type SupplierFilter } from "@/lib/fynix/suppliers";
import type { AgencyRow } from "@/server/domain/agency-overview";
import { AddAgencyButton } from "../suppliers/supplier-actions";

type Props = {
  rows: readonly AgencyRow[];
  filter: SupplierFilter;
  query: string;
  canWrite: boolean;
  /** The active coordinators an admin can add an agency under. */
  coordinators: readonly { readonly id: string; readonly name: string }[];
};

/** The Agencies list: Active and Archived as link tabs (the filter is in the address), a search, and a row per partner agency that opens its record. */
export function AgenciesTable({ rows, filter, query, canWrite, coordinators }: Props) {
  const counts = filterCounts(rows);
  const shown = filterAgencies(rows, filter, query);
  const add = canWrite && coordinators.length > 0 ? <AddAgencyButton primary /> : undefined;

  if (rows.length === 0) {
    return (
      <Panel aria-label="Agencies">
        <EmptyState icon={Handshake} title="No agencies yet" action={add}>
          {canWrite ? (coordinators.length === 0 ? "Add a coordinator first. A partner agency works under one." : "Add the first partner agency, then invite its people.") : "A Fynix admin adds agencies."}
        </EmptyState>
      </Panel>
    );
  }

  return (
    <Panel aria-label="Agencies">
      <PanelHeader title="All agencies" count={rows.length} />
      <TabNav
        label="Filter agencies"
        items={(["active", "archived"] as const).map((option) => ({
          label: option === "active" ? "Active" : "Archived",
          href: agenciesHref({ status: option, q: query }),
          count: counts[option],
          active: option === filter,
        }))}
      />
      <Toolbar trailing={`${shown.length} ${shown.length === 1 ? "agency" : "agencies"}`}>
        <SearchForm defaultValue={query} placeholder="Agency, email or coordinator" hidden={{ status: filter === "archived" ? "archived" : undefined }} />
      </Toolbar>

      {shown.length === 0 ? (
        <EmptyState icon={Handshake} title={query.trim() === "" ? `No ${filter} agencies` : "No agency matches"}>
          {query.trim() === "" ? (filter === "archived" ? "Agencies that are archived show here." : "Every agency is archived.") : "Try a different name, or clear the search."}
        </EmptyState>
      ) : (
        <div className="px-2.5 pb-3">
          <Table>
            <TableHeader>
              <TableRow className="hover:[&>th]:bg-navy-04">
                <TableHead className="max-lg:hidden">Ref</TableHead>
                <TableHead>Agency</TableHead>
                <TableHead className="max-md:hidden">Coordinator</TableHead>
                <TableHead className="text-right max-lg:hidden">People</TableHead>
                <TableHead className="text-right max-md:hidden">Campaigns</TableHead>
                <TableHead className="text-right max-xl:hidden">Sent this month</TableHead>
                <TableHead className="text-right">Accepted this month</TableHead>
                <TableHead className="max-md:hidden">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => (
                <TableRow key={row.id} className="relative">
                  <TableCell className="font-mono text-caption text-ink-2 max-lg:hidden">{row.publicRef}</TableCell>
                  <TableCell className="max-md:max-w-0 max-md:w-full">
                    <Link href={`/fynix/agencies/${row.publicRef}`} className="block truncate rounded-xs text-row font-semibold after:absolute after:inset-0 after:content-['']">
                      {row.name}
                    </Link>
                    {row.contactEmail === null ? null : <span className="block truncate text-caption text-ink-muted max-md:hidden">{row.contactEmail}</span>}
                    <span className="block truncate text-caption text-ink-muted md:hidden">{agencySubtitle(row)}</span>
                    {row.inviteWaiting ? <span className="block text-caption text-ink-muted max-md:hidden">Invite sent, not accepted yet</span> : null}
                  </TableCell>
                  <TableCell className="max-md:hidden">
                    <Link href={`/fynix/suppliers/${row.coordinator.publicRef}`} className="relative z-10 rounded-xs text-row hover:underline">
                      {row.coordinator.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right max-lg:hidden">{row.peopleCount}</TableCell>
                  <TableCell className="text-right max-md:hidden">{campaignCountsText(row.campaignCounts)}</TableCell>
                  <TableCell className="text-right max-xl:hidden">{row.submittedThisMonth}</TableCell>
                  <TableCell className="text-right">{row.acceptedThisMonth}</TableCell>
                  <TableCell className="max-md:hidden">
                    <Badge variant={row.status === "active" ? "green" : "quiet"} size="sm">
                      {row.status === "active" ? "Active" : "Archived"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}
