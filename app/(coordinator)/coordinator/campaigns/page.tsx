import type { Metadata } from "next";
import { Suspense } from "react";
import { CampaignsSummary } from "@/components/campaigns/campaigns-summary";
import { CampaignsView } from "@/components/campaigns/campaigns-view";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { parseCampaignTab } from "@/lib/campaign-status";
import { getDatabase } from "@/server/db/client";
import { listAssignableAgencies } from "@/server/domain/campaign-shares-tenant";
import { listTenantCampaigns } from "@/server/domain/campaigns-tenant";
import { requireCoordinator } from "@/server/coordinator/session";

export const metadata: Metadata = { title: "Campaigns" };

async function Campaigns({ searchParams }: { searchParams: PageProps<"/coordinator/campaigns">["searchParams"] }) {
  const params = await searchParams;
  const view = await requireCoordinator();
  const db = getDatabase("leads_agency").db;
  const [campaigns, agencies] = await Promise.all([listTenantCampaigns(db, view.actor, "coordinator"), listAssignableAgencies(db, view.actor)]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Campaigns" description="The campaigns Fynix has assigned to you. Split each one between your own team and your partner agencies." />
      <CampaignsSummary campaigns={campaigns} />
      <CampaignsView campaigns={campaigns} basePath="/coordinator/campaigns" tab={parseCampaignTab(params.status)} portal="coordinator" submitHref="/coordinator/leads/new" assign={{ ownOrgId: view.actor.orgId, agencies, canManage: view.canWrite }} />
    </div>
  );
}

export default function CoordinatorCampaignsPage({ searchParams }: PageProps<"/coordinator/campaigns">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Campaigns searchParams={searchParams} />
    </Suspense>
  );
}
