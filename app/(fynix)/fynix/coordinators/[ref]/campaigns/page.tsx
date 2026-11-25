import type { Metadata } from "next";
import { Suspense } from "react";
import { CampaignsPanel } from "@/components/fynix/records/record-panels";
import { PageSkeleton } from "@/components/kit/skeletons";
import { loadCoordinator } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Coordinator campaigns" };

async function Campaigns({ params }: { params: PageProps<"/fynix/coordinators/[ref]/campaigns">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  const coordinator = await loadCoordinator(ref, view.actor.userId);
  return <CampaignsPanel rows={coordinator.campaigns.map((row) => ({ ...row, other: row.clientName }))} {...(view.canWrite && coordinator.status === "active" ? { newHref: `/fynix/campaigns/new?coordinator=${coordinator.id}` } : {})} />;
}

export default function CoordinatorCampaignsPage({ params }: PageProps<"/fynix/coordinators/[ref]/campaigns">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Campaigns params={params} />
    </Suspense>
  );
}
