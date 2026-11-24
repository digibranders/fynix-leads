import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { CampaignsSummary } from "@/components/campaigns/campaigns-summary";
import { CampaignsView } from "@/components/campaigns/campaigns-view";
import { PageHeader } from "@/components/kit/page-header";
import { parseCampaignTab } from "@/lib/campaign-status";
import { getDatabase } from "@/server/db/client";
import { listTenantCampaigns } from "@/server/domain/campaigns-tenant";
import { requireClient } from "@/server/client/session";

export const metadata: Metadata = { title: "Campaigns" };

async function Campaigns({ searchParams }: { searchParams: PageProps<"/client/campaigns">["searchParams"] }) {
  const params = await searchParams;
  const view = await requireClient();
  const campaigns = await listTenantCampaigns(getDatabase("leads_client").db, view.actor, "client");
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Campaigns" description="Your campaigns, when they run, and how each is going against its target." />
      <CampaignsSummary campaigns={campaigns} />
      <CampaignsView campaigns={campaigns} basePath="/client/campaigns" tab={parseCampaignTab(params.status)} portal="client" />
    </div>
  );
}

export default function ClientCampaignsPage({ searchParams }: PageProps<"/client/campaigns">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Campaigns searchParams={searchParams} />
    </Suspense>
  );
}
