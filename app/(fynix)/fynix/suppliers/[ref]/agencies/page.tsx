import type { Metadata } from "next";
import { Suspense } from "react";
import { AgenciesPanel } from "@/components/fynix/suppliers/agencies-panel";
import { PageSkeleton } from "@/components/kit/skeletons";
import { loadSupplier } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Coordinator agencies" };

async function Agencies({ params }: { params: PageProps<"/fynix/suppliers/[ref]/agencies">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  return <AgenciesPanel supplier={await loadSupplier(ref, view.actor.userId)} canWrite={view.canWrite} />;
}

export default function SupplierAgenciesPage({ params }: PageProps<"/fynix/suppliers/[ref]/agencies">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Agencies params={params} />
    </Suspense>
  );
}
