import type { Metadata } from "next";
import { Suspense } from "react";
import { AgencyCampaignsPanel } from "@/components/fynix/agencies/agency-campaigns-panel";
import { PageSkeleton } from "@/components/kit/skeletons";
import { loadAgency } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Agency campaigns" };

async function Campaigns({ params }: { params: PageProps<"/fynix/agencies/[ref]/campaigns">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  return <AgencyCampaignsPanel rows={(await loadAgency(ref, view.actor.userId)).campaigns} />;
}

export default function AgencyCampaignsPage({ params }: PageProps<"/fynix/agencies/[ref]/campaigns">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Campaigns params={params} />
    </Suspense>
  );
}
