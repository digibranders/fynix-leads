import type { Metadata } from "next";
import { CampaignsView } from "@/components/tenant/campaigns-view";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { getDatabase } from "@/server/db/client";
import { listTenantCampaigns } from "@/server/domain/campaigns-tenant";
import { requireClient } from "@/server/client/session";

export const metadata: Metadata = { title: "Campaigns" };

export default async function ClientCampaignsPage() {
  const view = await requireClient();
  const campaigns = await listTenantCampaigns(getDatabase("leads_client").db, view.actor, "client");
  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader title="Campaigns" subtitle="Your campaigns, when they run, and how each is going against its target." />
      <CampaignsView campaigns={campaigns} portal="client" />
    </div>
  );
}
