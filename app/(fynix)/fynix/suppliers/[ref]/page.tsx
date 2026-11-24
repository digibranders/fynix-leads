import type { Metadata } from "next";
import { Suspense } from "react";
import { SupplierOverview } from "@/components/fynix/suppliers/supplier-overview";
import { PageSkeleton } from "@/components/kit/skeletons";
import { loadSupplier } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Coordinator" };

async function Overview({ params }: { params: PageProps<"/fynix/suppliers/[ref]">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  return <SupplierOverview supplier={await loadSupplier(ref, view.actor.userId)} />;
}

export default function SupplierOverviewPage({ params }: PageProps<"/fynix/suppliers/[ref]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Overview params={params} />
    </Suspense>
  );
}
