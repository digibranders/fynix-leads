import type { Metadata } from "next";
import { Suspense } from "react";
import { CampaignsPanel } from "@/components/fynix/records/record-panels";
import { PageSkeleton } from "@/components/kit/skeletons";
import { loadSupplier } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Coordinator campaigns" };

async function Campaigns({ params }: { params: PageProps<"/fynix/suppliers/[ref]/campaigns">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  const supplier = await loadSupplier(ref, view.actor.userId);
  return <CampaignsPanel rows={supplier.campaigns.map((row) => ({ ...row, other: row.clientName }))} />;
}

export default function SupplierCampaignsPage({ params }: PageProps<"/fynix/suppliers/[ref]/campaigns">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Campaigns params={params} />
    </Suspense>
  );
}
