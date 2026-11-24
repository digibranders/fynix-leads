import type { Metadata } from "next";
import { Table as TableIcon } from "@phosphor-icons/react/dist/ssr";
import { Suspense } from "react";
import { CampaignFilter } from "@/components/kit/campaign-filter";
import { ClosedTag } from "@/components/kit/closed-tag";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { Pager } from "@/components/kit/pager";
import { Panel } from "@/components/kit/panel";
import { PageSkeleton } from "@/components/kit/skeletons";
import { Person } from "@/components/kit/person";
import { StatusChip } from "@/components/kit/status-chip";
import { SearchForm, Toolbar } from "@/components/kit/toolbar";
import { When } from "@/components/kit/when";
import { PipelineBar } from "@/components/leads/pipeline-bar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { campaignFilterHrefs, closedCampaignIds, parseCampaignFilter } from "@/lib/campaign-status";
import { leadsHref } from "@/lib/leads/href";
import { filterLeads, paginate, parsePage } from "@/lib/leads/list";
import { parseGroup } from "@/lib/leads/pipeline";
import type { LeadStage } from "@/lib/leads/stage";
import { getDatabase } from "@/server/db/client";
import { listTenantCampaigns } from "@/server/domain/campaigns-tenant";
import { listClientLeads } from "@/server/domain/leads";
import { requireClient } from "@/server/client/session";

export const metadata: Metadata = { title: "Leads" };

const BASE = "/client/leads";
const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Leads({ searchParams }: { searchParams: PageProps<"/client/leads">["searchParams"] }) {
  const view = await requireClient();
  const params = await searchParams;
  const group = parseGroup(params.stage);
  const q = one(params.q) ?? "";

  const db = getDatabase("leads_client").db;
  const [all, campaigns] = await Promise.all([listClientLeads(db, view.actor), listTenantCampaigns(db, view.actor, "client")]);
  const campaign = parseCampaignFilter(params.campaign, campaigns);
  const names = new Map(campaigns.map((row) => [row.id, row.name]));
  const closed = closedCampaignIds(campaigns);
  const filtered = filterLeads(all, { group, q, campaign });
  const page = paginate(filtered, parsePage(params.page));
  const href = (nextPage: number) => leadsHref(BASE, { stage: group, q, campaign, page: nextPage });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Leads" description="Every prospect submitted for your campaign, across all stages." />

      {all.length === 0 ? (
        <Panel>
          <EmptyState icon={TableIcon} title="No leads yet">
            Prospects qualified for your campaign appear here as soon as they are submitted.
          </EmptyState>
        </Panel>
      ) : (
        <>
          <PipelineBar leads={all} basePath={BASE} group={group} q={q} campaign={campaign} />
          <Panel aria-label="Leads">
            <Toolbar trailing={`${filtered.length} ${filtered.length === 1 ? "lead" : "leads"}`}>
              <SearchForm defaultValue={q} placeholder="Search by name, company or reference" hidden={{ stage: group ?? undefined, campaign: campaign ?? undefined }} />
              <CampaignFilter campaigns={campaigns} selected={campaign} {...campaignFilterHrefs(campaigns, (id) => leadsHref(BASE, { stage: group, q, campaign: id }))} />
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
                      <TableHead className="max-md:hidden">Company</TableHead>
                      <TableHead className="max-xl:hidden">Campaign</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead className="max-lg:hidden">Meeting</TableHead>
                      <TableHead className="max-lg:hidden">Submitted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {page.rows.map((lead) => (
                      <TableRow key={lead.id} className="relative">
                        <TableCell>
                          <Person name={lead.prospectName} href={`${BASE}/${lead.publicRef}`} sub={<span className="font-mono">{lead.publicRef}</span>} />
                        </TableCell>
                        <TableCell className="max-md:hidden">
                          <span className="block leading-tight">
                            {lead.prospectCompany}
                            <span className="block text-caption text-ink-muted">{lead.prospectDomain}</span>
                          </span>
                        </TableCell>
                        <TableCell className="max-xl:hidden">
                          <span className="flex flex-wrap items-center gap-1.5 leading-tight">
                            {names.get(lead.campaignId) ?? "Campaign"}
                            {closed.has(lead.campaignId) ? <ClosedTag /> : null}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusChip kind="lead" status={lead.stage as LeadStage} size="sm" />
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
            <Pager
              from={page.from}
              to={page.to}
              total={page.total}
              prevHref={page.page > 1 ? href(page.page - 1) : undefined}
              nextHref={page.page < page.pages ? href(page.page + 1) : undefined}
            />
          </Panel>
        </>
      )}
    </div>
  );
}

export default function ClientLeadsPage({ searchParams }: PageProps<"/client/leads">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Leads searchParams={searchParams} />
    </Suspense>
  );
}
