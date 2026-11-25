import { Megaphone } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { CampaignStatusTabs } from "@/components/kit/campaign-status-tabs";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { StatusChip } from "@/components/kit/status-chip";
import { SearchForm, Toolbar } from "@/components/kit/toolbar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { campaignTabLabel, countByTab, DEFAULT_CAMPAIGN_TAB, inCampaignTab, type CampaignTab } from "@/lib/campaign-status";
import type { CampaignRow } from "@/server/domain/campaign-overview";

/** Every campaign: reference, name, client, coordinator and status, with a search. A row opens the campaign. Below `md` a row is two lines. */
export function CampaignsTable({ rows, query = "", tab = DEFAULT_CAMPAIGN_TAB }: { rows: readonly CampaignRow[]; query?: string; tab?: CampaignTab }) {
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
  const inTab = inCampaignTab(rows, tab);
  const counts = countByTab(rows);
  const shown =
    needle === ""
      ? inTab
      : inTab.filter((row) => [row.name, row.publicRef, row.clientName, row.coordinatorName].some((text) => text.toLowerCase().includes(needle)));

  return (
    <Panel aria-label="Campaigns">
      <PanelHeader title="Campaigns" count={rows.length} />
      <CampaignStatusTabs rows={rows} basePath="/fynix/campaigns" tab={tab} q={query} />
      <Toolbar trailing={`${shown.length} ${shown.length === 1 ? "campaign" : "campaigns"}`}>
        <SearchForm defaultValue={query} placeholder="Campaign, client or coordinator" hidden={{ status: tab === DEFAULT_CAMPAIGN_TAB ? undefined : tab }} />
      </Toolbar>
      {shown.length === 0 ? (
        <EmptyState icon={Megaphone} title={needle === "" ? `No ${campaignTabLabel(tab).toLowerCase()} campaigns` : "No campaign matches"}>
          {needle === ""
            ? `${counts.active} active, ${counts["setting-up"]} being set up, ${counts.closed} closed. Pick another tab to see them.`
            : "Try a different name, or clear the search."}
        </EmptyState>
      ) : (
        <div className="px-2.5">
          <Table>
            <TableHeader>
              <TableRow className="hover:[&>th]:bg-navy-04">
                <TableHead className="max-md:hidden">Ref</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead className="max-md:hidden">Client</TableHead>
                <TableHead className="max-lg:hidden">Coordinator</TableHead>
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
                      {row.clientName}, served by {row.coordinatorName}
                    </span>
                  </TableCell>
                  <TableCell className="max-md:hidden">{row.clientName}</TableCell>
                  <TableCell className="max-lg:hidden">{row.coordinatorName}</TableCell>
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
