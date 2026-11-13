import type { Metadata } from "next";
import { Suspense } from "react";
import { CampaignsTable } from "@/components/fynix/campaigns/campaigns-table";
import { FynixPageHeader } from "@/components/fynix/page-header";
import { ListBodySkeleton } from "@/components/fynix/skeletons";
import { getDomain } from "@/server/domain";
import { listCampaignRows } from "@/server/domain/campaign-overview";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Campaigns" };

async function Campaigns() {
  const view = await requireFynix();
  return <CampaignsTable rows={await listCampaignRows(getDomain(), view.actor)} />;
}

export default function CampaignsPage() {
  return (
    <>
      <FynixPageHeader title="Campaigns" subtitle="Every campaign, with its client and the supplier that serves it" />
      <Suspense fallback={<ListBodySkeleton />}>
        <Campaigns />
      </Suspense>
    </>
  );
}
