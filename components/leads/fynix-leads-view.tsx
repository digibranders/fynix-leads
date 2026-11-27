import { Table as TableIcon } from "@phosphor-icons/react/dist/ssr";
import { CampaignFilter } from "@/components/kit/campaign-filter";
import { ExportButton, exportHref } from "@/components/kit/export-button";
import { SortHead } from "@/components/kit/sort-head";
import { LEAD_SORT_CELLS } from "@/lib/leads/lead-sort";
import { sortRows, sortValue, type Sort } from "@/lib/leads/sort";
import { ClosedTag } from "@/components/kit/closed-tag";
import { EmptyState } from "@/components/kit/empty-state";
import { Pager } from "@/components/kit/pager";
import { Panel } from "@/components/kit/panel";
import { Person } from "@/components/kit/person";
import { StatusChip } from "@/components/kit/status-chip";
import { SearchForm, Toolbar } from "@/components/kit/toolbar";
import { When } from "@/components/kit/when";
import { PipelineBar } from "@/components/leads/pipeline-bar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { campaignFilterHrefs, closedCampaignIds, type CampaignChoice } from "@/lib/campaign-status";
import { leadsHref } from "@/lib/leads/href";
import { filterLeads, paginate } from "@/lib/leads/list";
import type { PipelineKey } from "@/lib/leads/pipeline";
import type { LeadStage } from "@/lib/leads/stage";

export interface FynixLeadRow {
  readonly id: string;
  readonly publicRef: string;
  readonly campaignId: string;
  readonly campaignName: string;
  readonly clientName: string;
  readonly prospectName: string;
  readonly prospectCompany: string;
  readonly prospectDomain: string;
  readonly stage: string;
  readonly scheduledMeetingTime: Date | string | null;
  readonly submittedAt: Date | string;
  readonly overShare: boolean;
  /** The client's host for the meeting. */
  readonly hostName?: string | null;
  /** The coordinator or agency that sent the lead. */
  readonly sourceName?: string;
}

/**
 * Every lead Fynix can see: stage bar, campaign filter, search, table, pager. State is in the URL. With `campaigns` left out the list is one
 * campaign's (its Leads tab), so there is no filter and no Campaign column.
 */
export function FynixLeadsView({
  leads,
  basePath,
  group,
  q,
  page: requestedPage,
  campaigns,
  campaign = null,
  sort = null,
  exportCampaignId,
  exportSourceOrgId,
  emptyText,
}: {
  readonly leads: readonly FynixLeadRow[];
  readonly basePath: string;
  readonly group: PipelineKey | null;
  readonly q: string;
  readonly page: number;
  /** The campaigns to filter by; left out inside a campaign. */
  readonly campaigns?: readonly CampaignChoice[];
  readonly campaign?: string | null;
  /** `?sort=`, already read. */
  readonly sort?: Sort | null;
  /** Inside a campaign the export is that campaign's. */
  readonly exportCampaignId?: string;
  /** Narrows the CSV to the leads one agency sent (the agency record's Leads tab). */
  readonly exportSourceOrgId?: string;
  readonly emptyText: string;
}) {
  if (leads.length === 0) {
    return (
      <Panel>
        <EmptyState icon={TableIcon} title="No leads submitted yet">
          {emptyText}
        </EmptyState>
      </Panel>
    );
  }
  const sortParam = sortValue(sort) ?? null;
  const filtered = sortRows(filterLeads(leads, { group, q, campaign }), sort, LEAD_SORT_CELLS);
  const page = paginate(filtered, requestedPage);
  const href = (nextPage: number) => leadsHref(basePath, { stage: group, q, campaign, sort: sortParam, page: nextPage });
  const sortHref = (value: string) => leadsHref(basePath, { stage: group, q, campaign, sort: value });
  const closed = closedCampaignIds(campaigns ?? []);

  return (
    <>
      <PipelineBar leads={leads} basePath={basePath} group={group} q={q} campaign={campaign} sort={sortParam} />
      <Panel aria-label="Leads">
        <Toolbar
          trailing={
            <span className="flex items-center gap-3">
              {`${filtered.length} ${filtered.length === 1 ? "lead" : "leads"}`}
              <ExportButton href={exportHref("leads", campaign ?? exportCampaignId ?? null, exportSourceOrgId ?? null)} />
            </span>
          }
        >
          <SearchForm defaultValue={q} placeholder="Search by name, company or reference" hidden={{ stage: group ?? undefined, campaign: campaign ?? undefined, sort: sortParam ?? undefined }} />
          {campaigns !== undefined ? <CampaignFilter campaigns={campaigns} selected={campaign} {...campaignFilterHrefs(campaigns, (id) => leadsHref(basePath, { stage: group, q, campaign: id, sort: sortParam }))} /> : null}
        </Toolbar>
        {page.rows.length === 0 ? (
          <EmptyState icon={TableIcon} title="No leads match">
            Clear the search or pick another stage or campaign to see more.
          </EmptyState>
        ) : (
          <div className="px-2.5">
            <Table>
              <TableHeader>
                <TableRow className="hover:[&>th]:bg-navy-04">
                  <SortHead label="Prospect" sortKey="prospect" sort={sort} hrefFor={sortHref} />
                  {campaigns !== undefined ? <TableHead className="max-md:hidden">Campaign</TableHead> : null}
                  <SortHead label="Company" sortKey="company" sort={sort} hrefFor={sortHref} className="max-xl:hidden" />
                  <TableHead className="max-xl:hidden">Team member</TableHead>
                  <TableHead className="max-xl:hidden">Source</TableHead>
                  <SortHead label="Stage" sortKey="stage" sort={sort} hrefFor={sortHref} />
                  <SortHead label="Meeting" sortKey="meeting" sort={sort} hrefFor={sortHref} className="max-lg:hidden" />
                  <SortHead label="Submitted" sortKey="submitted" sort={sort} hrefFor={sortHref} className="max-lg:hidden" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.rows.map((lead) => (
                  <TableRow key={lead.id} className="relative">
                    <TableCell>
                      <Person name={lead.prospectName} href={`/fynix/leads/${lead.publicRef}`} sub={<span className="font-mono">{lead.publicRef}</span>} />
                    </TableCell>
                    {campaigns !== undefined ? (
                      <TableCell className="max-md:hidden">
                        <span className="flex flex-wrap items-center gap-1.5 leading-tight">
                          <span>
                            {lead.campaignName}
                            <span className="block text-caption text-ink-muted">{lead.clientName}</span>
                          </span>
                          {closed.has(lead.campaignId) ? <ClosedTag /> : null}
                        </span>
                      </TableCell>
                    ) : null}
                    <TableCell className="max-xl:hidden">
                      <span className="block leading-tight">
                        {lead.prospectCompany}
                        <span className="block text-caption text-ink-muted">{lead.prospectDomain}</span>
                      </span>
                    </TableCell>
                    <TableCell className="max-xl:hidden">{lead.hostName ?? <span className="text-ink-muted">Not set</span>}</TableCell>
                    <TableCell className="max-xl:hidden">{lead.sourceName ?? <span className="text-ink-muted">Not shown</span>}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <StatusChip kind="lead" status={lead.stage as LeadStage} size="sm" />
                        {lead.overShare ? (
                          <Badge variant="amber" size="sm">
                            Over share
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-ink-2 max-lg:hidden">
                      {lead.scheduledMeetingTime ? <When at={lead.scheduledMeetingTime} /> : <span className="text-ink-muted">Not scheduled</span>}
                    </TableCell>
                    <TableCell className="text-ink-muted max-lg:hidden">
                      <When at={lead.submittedAt} style="day" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Pager from={page.from} to={page.to} total={page.total} prevHref={page.page > 1 ? href(page.page - 1) : undefined} nextHref={page.page < page.pages ? href(page.page + 1) : undefined} />
      </Panel>
    </>
  );
}
