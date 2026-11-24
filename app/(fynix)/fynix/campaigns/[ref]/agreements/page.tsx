import type { Metadata } from "next";
import { Suspense } from "react";
import { AgreementCard } from "@/components/fynix/campaigns/agreement-card";
import { SharesCard } from "@/components/fynix/campaigns/shares-card";
import { TableSkeleton } from "@/components/kit/skeletons";
import { getDomain } from "@/server/domain";
import { readAgreementsPage } from "@/server/domain/campaign-overview";
import { loadCampaign } from "@/server/fynix/campaign";
import { isClosed } from "@/lib/campaign-status";
import { orNotFound, requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Agreements and shares" };

async function Agreements({ params }: { params: PageProps<"/fynix/campaigns/[ref]/agreements">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  const campaign = await loadCampaign(ref, view.actor.userId);
  const deps = getDomain();
  const closed = isClosed(campaign.status);
  const page = await orNotFound(readAgreementsPage(deps, view.actor, campaign.id));

  return (
    <div className="flex flex-col gap-4">
      <AgreementCard side={page.agreement} withName={`${campaign.clientName} and ${campaign.supplierName}`} campaignId={campaign.id} timeZone={campaign.timeZone} canWrite={view.canWrite} closed={closed} />
      <SharesCard page={page} campaignId={campaign.id} supplierName={campaign.supplierName} timeZone={campaign.timeZone} now={deps.now()} canWrite={view.canWrite && !closed} />
    </div>
  );
}

export default function AgreementsPage({ params }: PageProps<"/fynix/campaigns/[ref]/agreements">) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <TableSkeleton rows={3} />
          <TableSkeleton rows={3} />
        </div>
      }
    >
      <Agreements params={params} />
    </Suspense>
  );
}
