import type { Metadata } from "next";
import { Suspense } from "react";
import { TableSkeleton } from "@/components/kit/skeletons";
import { FynixLeadsView } from "@/components/leads/fynix-leads-view";
import { parseCampaignFilter } from "@/lib/campaign-status";
import { parsePage } from "@/lib/leads/list";
import { parseGroup } from "@/lib/leads/pipeline";
import { parseSort } from "@/lib/leads/sort";
import { getDatabase } from "@/server/db/client";
import { listFynixLeads } from "@/server/domain/leads";
import { loadAgency } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Agency leads" };

const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Leads({ params, searchParams }: { params: PageProps<"/fynix/agencies/[ref]/leads">["params"]; searchParams: PageProps<"/fynix/agencies/[ref]/leads">["searchParams"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  const query = await searchParams;
  const agency = await loadAgency(ref, view.actor.userId);
  const leads = await listFynixLeads(getDatabase("leads_fynix").db, view.actor, { sourceOrgId: agency.id });
  const campaigns = agency.campaigns.map((row) => ({ id: row.id, name: row.name, status: row.status }));
  return (
    <FynixLeadsView
      leads={leads}
      basePath={`/fynix/agencies/${agency.publicRef}/leads`}
      group={parseGroup(query.stage)}
      q={one(query.q) ?? ""}
      page={parsePage(query.page)}
      campaigns={campaigns}
      campaign={parseCampaignFilter(query.campaign, campaigns)}
      sort={parseSort(query.sort)}
      exportSourceOrgId={agency.id}
      emptyText="Leads this agency sends appear here."
    />
  );
}

export default function AgencyLeadsPage({ params, searchParams }: PageProps<"/fynix/agencies/[ref]/leads">) {
  return (
    <Suspense fallback={<TableSkeleton rows={5} />}>
      <Leads params={params} searchParams={searchParams} />
    </Suspense>
  );
}
