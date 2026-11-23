import type { Metadata } from "next";
import { CampaignsView } from "@/components/tenant/campaigns-view";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { getDatabase } from "@/server/db/client";
import { listTenantCampaigns } from "@/server/domain/campaigns-tenant";
import { requireAgency } from "@/server/agency/session";

export const metadata: Metadata = { title: "Campaigns" };

export default async function AgencyCampaignsPage() {
  const view = await requireAgency();
  const campaigns = await listTenantCampaigns(getDatabase("leads_agency").db, view.actor, "agency");
  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader title="Campaigns" subtitle="The campaigns assigned to you, your monthly share of each, and what you have delivered." />
      <CampaignsView campaigns={campaigns} portal="agency" submitHref="/agency/leads/new" />
    </div>
  );
}
