import type { Metadata } from "next";
import { Suspense } from "react";
import { CampaignsView } from "@/components/campaigns/campaigns-view";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { MiniStat } from "@/components/kit/stat";
import { getDatabase } from "@/server/db/client";
import { listAssignableAgencies } from "@/server/domain/campaign-shares-tenant";
import { listTenantCampaigns } from "@/server/domain/campaigns-tenant";
import { requireSupplier } from "@/server/supplier/session";

export const metadata: Metadata = { title: "Campaigns" };

async function Campaigns() {
  const view = await requireSupplier();
  const db = getDatabase("leads_agency").db;
  const [campaigns, agencies] = await Promise.all([listTenantCampaigns(db, view.actor, "supplier"), listAssignableAgencies(db, view.actor)]);
  const active = campaigns.filter((row) => row.status === "active").length;
  const delivered = campaigns.reduce((sum, row) => sum + row.delivered, 0);
  const inProgress = campaigns.reduce((sum, row) => sum + row.inProgress, 0);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Campaigns" description="The campaigns Fynix has assigned to you. Split each one between your own team and your partner agencies." />
      {campaigns.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <MiniStat label="Active campaigns" value={active} foot={`${campaigns.length} in total`} />
          <MiniStat label="Leads delivered" value={delivered} foot="Accepted and counted" tone="green" />
          <MiniStat label="In progress" value={inProgress} foot="Waiting, booked or awaiting an outcome" tone="blue" />
        </div>
      ) : null}
      <CampaignsView campaigns={campaigns} portal="supplier" submitHref="/supplier/leads/new" assign={{ ownOrgId: view.actor.orgId, agencies, canManage: view.canWrite }} />
    </div>
  );
}

export default function SupplierCampaignsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Campaigns />
    </Suspense>
  );
}
