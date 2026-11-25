import Link from "next/link";
import { Plus, Table as TableIcon } from "@phosphor-icons/react/dist/ssr";
import { ExportButton, exportHref } from "@/components/kit/export-button";
import { SortHead } from "@/components/kit/sort-head";
import { TabNav } from "@/components/kit/tab-nav";
import { DraftsTable, type DraftRow } from "@/components/leads/drafts-table";
import { LEAD_SORT_CELLS } from "@/lib/leads/lead-sort";
import { sortRows, sortValue, type Sort } from "@/lib/leads/sort";
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
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { campaignFilterHrefs, closedCampaignIds, type CampaignChoice } from "@/lib/campaign-status";
import { leadsHref } from "@/lib/leads/href";
import { filterLeads, paginate } from "@/lib/leads/list";
import type { PipelineKey } from "@/lib/leads/pipeline";
import type { LeadStage } from "@/lib/leads/stage";

/** The columns of a lead that a coordinator or an agency sees on the list. Nothing about the client's people is in it. */
export interface SourceLeadRow {
  readonly id: string;
  readonly publicRef: string;
  readonly campaignId: string;
  readonly prospectName: string;
  readonly prospectTitle: string;
  readonly prospectCompany: string;
  readonly prospectDomain: string;
  readonly stage: string;
  readonly scheduledMeetingTime: Date | string | null;
  readonly submittedAt: Date | string;
  readonly overShare: boolean;
  readonly sourceOrgId: string;
  readonly aliasIdentityId: string | null;
}

export interface SourceLeadsViewProps {
  readonly leads: readonly SourceLeadRow[];
  readonly basePath: string;
  readonly submitHref: string;
  readonly emptyText: string;
  readonly group: PipelineKey | null;
  readonly q: string;
  readonly page: number;
  readonly ownOrgId: string;
  /** Campaign name and the client name, by campaign id. */
  readonly campaigns: Readonly<Record<string, { readonly name: string; readonly clientName: string }>>;
  /** The campaigns the viewer can filter by, with their status. */
  readonly campaignChoices: readonly CampaignChoice[];
  /** The campaign chosen in the filter, or null for all. */
  readonly campaign: string | null;
  /** The viewer's own alias names, by alias id. */
  readonly aliasNames: Readonly<Record<string, string>>;
  /** The names of the coordinator's partner agencies, by organisation id, for "Sent by". Empty for an agency. */
  readonly partnerNames?: Readonly<Record<string, string>>;
  /** The organisation's own drafts: a tab beside the leads. */
  readonly drafts?: readonly DraftRow[];
  /** `?show=drafts` opens the drafts tab. */
  readonly showDrafts?: boolean;
  /** `?sort=`, already read. */
  readonly sort?: Sort | null;
}

function sourceOf(lead: SourceLeadRow, props: SourceLeadsViewProps): string {
  const alias = lead.aliasIdentityId === null ? undefined : props.aliasNames[lead.aliasIdentityId];
  if (lead.sourceOrgId !== props.ownOrgId) return props.partnerNames?.[lead.sourceOrgId] ?? "a partner agency";
  return alias ?? "your team";
}

/** The leads of a coordinator or an agency: stage bar, search, table, pager. State is in the URL, as on the client's list. */
export function SourceLeadsView(props: SourceLeadsViewProps) {
  const { leads, basePath, submitHref, emptyText, group, q } = props;
  const { campaign: chosen, campaignChoices } = props;
  const drafts = props.drafts ?? [];
  const sort = props.sort ?? null;
  const sortParam = sortValue(sort) ?? null;
  const filtered = sortRows(filterLeads(leads, { group, q, campaign: chosen }), sort, LEAD_SORT_CELLS);
  const page = paginate(filtered, props.page);
  const href = (next: number) => leadsHref(basePath, { stage: group, q, campaign: chosen, sort: sortParam, page: next });
  const sortHref = (value: string) => leadsHref(basePath, { stage: group, q, campaign: chosen, sort: value });
  const closed = closedCampaignIds(campaignChoices);

  if (leads.length === 0 && drafts.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={TableIcon}
          title="No leads submitted yet"
          action={
            <Link href={submitHref} className={buttonVariants({ variant: "default" })}>
              <Plus aria-hidden weight="bold" />
              Submit a lead
            </Link>
          }
        >
          {emptyText}
        </EmptyState>
      </Panel>
    );
  }

  const tabs = (
    <Panel aria-label="Leads or drafts">
      <TabNav
        label="Leads or drafts"
        items={[
          { label: "Leads", href: basePath, count: leads.length, active: props.showDrafts !== true },
          { label: "Drafts", href: `${basePath}?show=drafts`, count: drafts.length, active: props.showDrafts === true },
        ]}
      />
    </Panel>
  );

  if (props.showDrafts === true) {
    return (
      <>
        {tabs}
        <Panel aria-label="Drafts">
          <DraftsTable drafts={drafts} newHref={submitHref} campaigns={props.campaigns} />
        </Panel>
      </>
    );
  }

  return (
    <>
      {drafts.length > 0 ? tabs : null}
      <PipelineBar leads={leads} basePath={basePath} group={group} q={q} campaign={chosen} sort={sortParam} />
      <Panel aria-label="Leads">
        <Toolbar
          trailing={
            <span className="flex items-center gap-3">
              {`${filtered.length} ${filtered.length === 1 ? "lead" : "leads"}`}
              <ExportButton href={exportHref("leads", chosen)} />
            </span>
          }
        >
          <SearchForm defaultValue={q} placeholder="Search by name, company or reference" hidden={{ stage: group ?? undefined, campaign: chosen ?? undefined, sort: sortParam ?? undefined }} />
          <CampaignFilter campaigns={campaignChoices} selected={chosen} {...campaignFilterHrefs(campaignChoices, (id) => leadsHref(basePath, { stage: group, q, campaign: id, sort: sortParam }))} />
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
                  <SortHead label="Company" sortKey="company" sort={sort} hrefFor={sortHref} className="max-md:hidden" />
                  <TableHead className="max-xl:hidden">Campaign</TableHead>
                  <SortHead label="Stage" sortKey="stage" sort={sort} hrefFor={sortHref} />
                  <SortHead label="Meeting" sortKey="meeting" sort={sort} hrefFor={sortHref} className="max-lg:hidden" />
                  <SortHead label="Submitted" sortKey="submitted" sort={sort} hrefFor={sortHref} className="max-lg:hidden" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.rows.map((lead) => {
                  const campaign = props.campaigns[lead.campaignId];
                  return (
                    <TableRow key={lead.id} className="relative">
                      <TableCell>
                        <Person name={lead.prospectName} href={`${basePath}/${lead.publicRef}`} sub={<span className="font-mono">{lead.publicRef}</span>} />
                      </TableCell>
                      <TableCell className="max-md:hidden">
                        <span className="block leading-tight">
                          {lead.prospectCompany}
                          <span className="block text-caption text-ink-muted">{lead.prospectDomain}</span>
                        </span>
                      </TableCell>
                      <TableCell className="max-xl:hidden">
                        {campaign ? (
                          <span className="flex flex-wrap items-center gap-1.5 leading-tight">
                            <span>
                              {campaign.name}
                              <span className="block text-caption text-ink-muted">{campaign.clientName}</span>
                            </span>
                            {closed.has(lead.campaignId) ? <ClosedTag /> : null}
                          </span>
                        ) : (
                          <span className="text-ink-muted">Not shown</span>
                        )}
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
                      <TableCell className="max-lg:hidden">
                        <span className="block leading-tight text-ink-2">
                          <When at={lead.submittedAt} style="day" />
                          <span className="block text-caption text-ink-muted">Sent by {sourceOf(lead, props)}</span>
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <Pager
          from={page.from}
          to={page.to}
          total={page.total}
          prevHref={page.page > 1 ? href(page.page - 1) : undefined}
          nextHref={page.page < page.pages ? href(page.page + 1) : undefined}
        />
      </Panel>
    </>
  );
}
