import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { CampaignsView } from "@/components/campaigns/campaigns-view";
import { PageHeader } from "@/components/kit/page-header";
import { MiniStat } from "@/components/kit/stat";
import { getDatabase } from "@/server/db/client";
import { listTenantCampaigns } from "@/server/domain/campaigns-tenant";
import { requireClient } from "@/server/client/session";

export const metadata: Metadata = { title: "Campaigns" };

async function Campaigns() {
  const view = await requireClient();
  const campaigns = await listTenantCampaigns(getDatabase("leads_client").db, view.actor, "client");
  const active = campaigns.filter((row) => row.status === "active").length;
  const delivered = campaigns.reduce((sum, row) => sum + row.delivered, 0);
  const inProgress = campaigns.reduce((sum, row) => sum + row.inProgress, 0);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Campaigns" description="Your campaigns, when they run, and how each is going against its target." />
      {campaigns.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <MiniStat label="Active campaigns" value={active} foot={`${campaigns.length} in total`} />
          <MiniStat label="Leads delivered" value={delivered} foot="Accepted and counted" tone="green" />
          <MiniStat label="In progress" value={inProgress} foot="Waiting, booked or awaiting an outcome" tone="blue" />
        </div>
      ) : null}
      <CampaignsView campaigns={campaigns} portal="client" />
    </div>
  );
}

export default function ClientCampaignsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Campaigns />
    </Suspense>
  );
}
