import type { Metadata } from "next";
import { Suspense } from "react";
import { CampaignsTable } from "@/components/fynix/campaigns/campaigns-table";
import { NewCampaignButton } from "@/components/fynix/campaigns/campaign-edit-actions";
import { parseCampaignTab } from "@/lib/campaign-status";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { getDomain } from "@/server/domain";
import { listCampaignRows } from "@/server/domain/campaign-overview";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Campaigns" };

const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Campaigns({ searchParams }: { searchParams: PageProps<"/fynix/campaigns">["searchParams"] }) {
  const view = await requireFynix();
  const params = await searchParams;
  const rows = await listCampaignRows(getDomain(), view.actor);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Campaigns" description="Every campaign, with its client and the coordinator that serves it." actions={view.canWrite ? <NewCampaignButton /> : null} />
      <CampaignsTable rows={rows} query={one(params.q) ?? ""} tab={parseCampaignTab(params.status, rows)} />
    </div>
  );
}

export default function CampaignsPage({ searchParams }: PageProps<"/fynix/campaigns">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Campaigns searchParams={searchParams} />
    </Suspense>
  );
}
