import type { Metadata } from "next";
import { Suspense } from "react";
import { CampaignsSummary } from "@/components/campaigns/campaigns-summary";
import { CampaignsView } from "@/components/campaigns/campaigns-view";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { parseCampaignTab } from "@/lib/campaign-status";
import { getDatabase } from "@/server/db/client";
import { listTenantCampaigns } from "@/server/domain/campaigns-tenant";
import { requireAgency } from "@/server/agency/session";

export const metadata: Metadata = { title: "Campaigns" };

async function Campaigns({ searchParams }: { searchParams: PageProps<"/agency/campaigns">["searchParams"] }) {
  const params = await searchParams;
  const view = await requireAgency();
  const campaigns = await listTenantCampaigns(getDatabase("leads_agency").db, view.actor, "agency");
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Campaigns" description="The campaigns assigned to you, your monthly share of each, and what you have delivered." />
      <CampaignsSummary campaigns={campaigns} />
      <CampaignsView campaigns={campaigns} basePath="/agency/campaigns" tab={parseCampaignTab(params.status)} portal="agency" submitHref="/agency/leads/new" />
    </div>
  );
}

export default function AgencyCampaignsPage({ searchParams }: PageProps<"/agency/campaigns">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Campaigns searchParams={searchParams} />
    </Suspense>
  );
}
