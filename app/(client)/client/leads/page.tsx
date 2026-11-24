import type { Metadata } from "next";
import { Table as TableIcon } from "@phosphor-icons/react/dist/ssr";
import { Suspense } from "react";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { Pager } from "@/components/kit/pager";
import { Panel } from "@/components/kit/panel";
import { PageSkeleton } from "@/components/kit/skeletons";
import { Person } from "@/components/kit/person";
import { StatusChip } from "@/components/kit/status-chip";
import { SearchForm, Toolbar } from "@/components/kit/toolbar";
import { When } from "@/components/kit/when";
import { DisputeButton } from "@/components/leads/dispute-button";
import { PipelineBar } from "@/components/leads/pipeline-bar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { leadsHref } from "@/lib/leads/href";
import { filterLeads, paginate, parsePage } from "@/lib/leads/list";
import { parseGroup } from "@/lib/leads/pipeline";
import type { LeadStage } from "@/lib/leads/stage";
import { getDatabase } from "@/server/db/client";
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

  const all = await listClientLeads(getDatabase("leads_client").db, view.actor);
  const filtered = filterLeads(all, { group, q });
  const page = paginate(filtered, parsePage(params.page));
  const href = (nextPage: number) => leadsHref(BASE, { stage: group, q, page: nextPage });

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
          <PipelineBar leads={all} basePath={BASE} group={group} q={q} />
          <Panel aria-label="Leads">
            <Toolbar trailing={`${filtered.length} ${filtered.length === 1 ? "lead" : "leads"}`}>
              <SearchForm defaultValue={q} placeholder="Search by name, company or reference" hidden={{ stage: group ?? undefined }} />
            </Toolbar>
            {page.rows.length === 0 ? (
              <EmptyState icon={TableIcon} title="No leads match">
                Clear the search or pick another stage to see more.
              </EmptyState>
            ) : (
              <div className="px-2.5">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:[&>th]:bg-navy-04">
                      <TableHead>Prospect</TableHead>
                      <TableHead className="max-md:hidden">Company</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead className="max-lg:hidden">Meeting</TableHead>
                      <TableHead className="max-lg:hidden">Submitted</TableHead>
                      <TableHead className="text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {page.rows.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell>
                          <Person name={lead.prospectName} sub={<span className="font-mono">{lead.publicRef}</span>} />
                        </TableCell>
                        <TableCell className="max-md:hidden">
                          <span className="block leading-tight">
                            {lead.prospectCompany}
                            <span className="block text-caption text-ink-muted">{lead.prospectDomain}</span>
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
                        <TableCell className="text-right">
                          {lead.canDispute && view.canWrite ? <DisputeButton leadId={lead.id} prospectName={lead.prospectName} /> : null}
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
