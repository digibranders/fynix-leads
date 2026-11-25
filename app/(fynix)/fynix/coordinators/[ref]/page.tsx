import type { Metadata } from "next";
import { Suspense } from "react";
import { CoordinatorOverview } from "@/components/fynix/coordinators/coordinator-overview";
import { PageSkeleton } from "@/components/kit/skeletons";
import { loadCoordinator } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Coordinator" };

async function Overview({ params }: { params: PageProps<"/fynix/coordinators/[ref]">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  return <CoordinatorOverview coordinator={await loadCoordinator(ref, view.actor.userId)} canWrite={view.canWrite} />;
}

export default function CoordinatorOverviewPage({ params }: PageProps<"/fynix/coordinators/[ref]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Overview params={params} />
    </Suspense>
  );
}
