import type { Metadata } from "next";
import { Suspense } from "react";
import { AgencyOverview } from "@/components/fynix/agencies/agency-overview";
import { PageSkeleton } from "@/components/kit/skeletons";
import { loadAgency } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Agency" };

async function Overview({ params }: { params: PageProps<"/fynix/agencies/[ref]">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  return <AgencyOverview agency={await loadAgency(ref, view.actor.userId)} canWrite={view.canWrite} />;
}

export default function AgencyOverviewPage({ params }: PageProps<"/fynix/agencies/[ref]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Overview params={params} />
    </Suspense>
  );
}
