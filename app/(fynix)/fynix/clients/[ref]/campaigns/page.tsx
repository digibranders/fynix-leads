import type { Metadata } from "next";
import { Suspense } from "react";
import { CampaignsPanel } from "@/components/fynix/records/record-panels";
import { PageSkeleton } from "@/components/kit/skeletons";
import { loadClient } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Client campaigns" };

async function Campaigns({ params }: { params: PageProps<"/fynix/clients/[ref]/campaigns">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  const client = await loadClient(ref, view.actor.userId);
  return <CampaignsPanel rows={client.campaigns.map((row) => ({ ...row, other: `Served by ${row.supplierName}` }))} />;
}

export default function ClientCampaignsPage({ params }: PageProps<"/fynix/clients/[ref]/campaigns">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Campaigns params={params} />
    </Suspense>
  );
}
