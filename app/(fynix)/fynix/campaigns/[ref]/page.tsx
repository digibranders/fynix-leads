import type { Metadata } from "next";
import { Suspense } from "react";
import { ProspectEmailPanel } from "@/components/fynix/campaigns/prospect-email-panel";
import { BriefView } from "@/components/fynix/campaigns/brief-view";
import { TableSkeleton } from "@/components/kit/skeletons";
import { loadProspectEmail } from "@/server/fynix/prospect-email";
import { loadCampaign } from "@/server/fynix/campaign";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Campaign brief" };

async function Brief({ params }: { params: PageProps<"/fynix/campaigns/[ref]">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  const campaign = await loadCampaign(ref, view.actor.userId);
  const { privacy, launchEmailsOn } = await loadProspectEmail(ref, view.actor.userId);
  return (
    <div className="flex flex-col gap-4">
      <BriefView campaign={campaign} />
      <ProspectEmailPanel campaignId={campaign.id} privacyUrl={privacy.clientPrivacyUrl} prospectEmailEnabled={privacy.prospectEmailEnabled} letterOpening={privacy.prospectLetterOpening} launchEmailsOn={launchEmailsOn} canWrite={view.canWrite} />
    </div>
  );
}

export default function BriefPage({ params }: PageProps<"/fynix/campaigns/[ref]">) {
  return (
    <Suspense fallback={<TableSkeleton rows={4} />}>
      <Brief params={params} />
    </Suspense>
  );
}
