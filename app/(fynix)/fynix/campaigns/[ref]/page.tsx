import type { Metadata } from "next";
import { Suspense } from "react";
import { BriefView } from "@/components/fynix/campaigns/brief-view";
import { TableSkeleton } from "@/components/kit/skeletons";
import { loadCampaign } from "@/server/fynix/campaign";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Campaign brief" };

async function Brief({ params }: { params: PageProps<"/fynix/campaigns/[ref]">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  return <BriefView campaign={await loadCampaign(ref, view.actor.userId)} />;
}

export default function BriefPage({ params }: PageProps<"/fynix/campaigns/[ref]">) {
  return (
    <Suspense fallback={<TableSkeleton rows={4} />}>
      <Brief params={params} />
    </Suspense>
  );
}
