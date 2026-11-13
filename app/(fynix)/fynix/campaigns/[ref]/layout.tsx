import { Suspense } from "react";
import { CampaignTitle } from "@/components/fynix/campaigns/campaign-header";
import { CampaignHeaderSkeleton } from "@/components/fynix/skeletons";
import { loadCampaign } from "@/server/fynix/campaign";
import { requireFynix } from "@/server/fynix/session";

async function Title({ params }: { params: LayoutProps<"/fynix/campaigns/[ref]">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  return <CampaignTitle campaign={await loadCampaign(ref, view.actor.userId)} />;
}

/** The title and tabs sit in their own boundary, so a tab's content does not wait for them. Each tab asks for the campaign itself. */
export default function CampaignLayout({ children, params }: LayoutProps<"/fynix/campaigns/[ref]">) {
  return (
    <>
      <Suspense fallback={<CampaignHeaderSkeleton />}>
        <Title params={params} />
      </Suspense>
      {children}
    </>
  );
}
