import type { Metadata } from "next";
import { Suspense } from "react";
import { TableSkeleton } from "@/components/kit/skeletons";
import { FynixLeadsView } from "@/components/leads/fynix-leads-view";
import { parsePage } from "@/lib/leads/list";
import { parseGroup } from "@/lib/leads/pipeline";
import { getDatabase } from "@/server/db/client";
import { listFynixLeads } from "@/server/domain/leads";
import { loadCampaign } from "@/server/fynix/campaign";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Campaign leads" };

const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Leads({ params, searchParams }: { params: PageProps<"/fynix/campaigns/[ref]/leads">["params"]; searchParams: PageProps<"/fynix/campaigns/[ref]/leads">["searchParams"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  const query = await searchParams;
  const campaign = await loadCampaign(ref, view.actor.userId);
  const leads = await listFynixLeads(getDatabase("leads_fynix").db, view.actor, { campaignId: campaign.id });
  return (
    <FynixLeadsView
      leads={leads}
      basePath={`/fynix/campaigns/${campaign.publicRef}/leads`}
      group={parseGroup(query.stage)}
      q={one(query.q) ?? ""}
      page={parsePage(query.page)}
      emptyText="Leads submitted for this campaign appear here."
    />
  );
}

export default function CampaignLeadsPage({ params, searchParams }: PageProps<"/fynix/campaigns/[ref]/leads">) {
  return (
    <Suspense fallback={<TableSkeleton rows={5} />}>
      <Leads params={params} searchParams={searchParams} />
    </Suspense>
  );
}
