import type { Metadata } from "next";
import { Suspense } from "react";
import { AgenciesPanel } from "@/components/fynix/coordinators/agencies-panel";
import { PageSkeleton } from "@/components/kit/skeletons";
import { loadCoordinator } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Coordinator agencies" };

async function Agencies({ params }: { params: PageProps<"/fynix/coordinators/[ref]/agencies">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  return <AgenciesPanel coordinator={await loadCoordinator(ref, view.actor.userId)} canWrite={view.canWrite} />;
}

export default function CoordinatorAgenciesPage({ params }: PageProps<"/fynix/coordinators/[ref]/agencies">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Agencies params={params} />
    </Suspense>
  );
}
