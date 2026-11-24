import { Table as TableIcon } from "@phosphor-icons/react/dist/ssr";
import { CampaignFilter } from "@/components/kit/campaign-filter";
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
  readonly clientBrandName: string;
  readonly prospectName: string;
  readonly prospectCompany: string;
  readonly prospectDomain: string;
  readonly stage: string;
  readonly scheduledMeetingTime: Date | string | null;
  readonly submittedAt: Date | string;
  readonly overShare: boolean;
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
  const filtered = filterLeads(leads, { group, q, campaign });
  const page = paginate(filtered, requestedPage);
  const href = (nextPage: number) => leadsHref(basePath, { stage: group, q, campaign, page: nextPage });
  const closed = closedCampaignIds(campaigns ?? []);

  return (
    <>
      <PipelineBar leads={leads} basePath={basePath} group={group} q={q} campaign={campaign} />
      <Panel aria-label="Leads">
        <Toolbar trailing={`${filtered.length} ${filtered.length === 1 ? "lead" : "leads"}`}>
          <SearchForm defaultValue={q} placeholder="Search by name, company or reference" hidden={{ stage: group ?? undefined, campaign: campaign ?? undefined }} />
          {campaigns !== undefined ? <CampaignFilter campaigns={campaigns} selected={campaign} {...campaignFilterHrefs(campaigns, (id) => leadsHref(basePath, { stage: group, q, campaign: id }))} /> : null}
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
                  <TableHead>Prospect</TableHead>
                  {campaigns !== undefined ? <TableHead className="max-md:hidden">Campaign</TableHead> : null}
                  <TableHead className="max-xl:hidden">Company</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="max-lg:hidden">Meeting</TableHead>
                  <TableHead className="max-lg:hidden">Submitted</TableHead>
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
                            <span className="block text-caption text-ink-muted">{lead.clientBrandName}</span>
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
