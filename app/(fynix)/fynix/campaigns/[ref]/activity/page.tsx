import type { Metadata } from "next";
import { Suspense } from "react";
import { CampaignActivityPanel } from "@/components/fynix/campaigns/campaign-activity-panel";
import { TableSkeleton } from "@/components/kit/skeletons";
import { getDomain } from "@/server/domain";
import { readCampaignActivity } from "@/server/domain/campaign-activity";
import { loadCampaign } from "@/server/fynix/campaign";
import { orNotFound, requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Campaign activity" };

async function Activity({ params }: { params: PageProps<"/fynix/campaigns/[ref]/activity">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  const campaign = await loadCampaign(ref, view.actor.userId);
  return <CampaignActivityPanel rows={await orNotFound(readCampaignActivity(getDomain(), view.actor, campaign.id))} />;
}

export default function ActivityPage({ params }: PageProps<"/fynix/campaigns/[ref]/activity">) {
  return (
    <Suspense fallback={<TableSkeleton rows={5} />}>
      <Activity params={params} />
    </Suspense>
  );
}
