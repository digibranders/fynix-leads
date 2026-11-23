import type { Metadata } from "next";
import { CampaignsView } from "@/components/tenant/campaigns-view";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { getDatabase } from "@/server/db/client";
import { listAssignableAgencies } from "@/server/domain/campaign-shares-tenant";
import { listTenantCampaigns } from "@/server/domain/campaigns-tenant";
import { requireSupplier } from "@/server/supplier/session";

export const metadata: Metadata = { title: "Campaigns" };

export default async function SupplierCampaignsPage() {
  const view = await requireSupplier();
  const db = getDatabase("leads_agency").db;
  const [campaigns, agencies] = await Promise.all([listTenantCampaigns(db, view.actor, "supplier"), listAssignableAgencies(db, view.actor)]);
  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader title="Campaigns" subtitle="The campaigns Fynix has assigned to you. Split each one between your own team and your partner agencies." />
      <CampaignsView campaigns={campaigns} portal="supplier" submitHref="/supplier/leads/new" assign={{ ownOrgId: view.actor.orgId, agencies, canManage: view.canWrite }} />
    </div>
  );
}
