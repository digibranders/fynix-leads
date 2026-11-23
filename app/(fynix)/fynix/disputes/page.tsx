import type { Metadata } from "next";
import { Suspense } from "react";
import { DisputesTable } from "@/components/fynix/disputes/disputes-table";
import { FynixPageHeader } from "@/components/fynix/page-header";
import { ListBodySkeleton } from "@/components/fynix/skeletons";
import { getDomain } from "@/server/domain";
import { listOpenDisputes } from "@/server/domain/dispute-overview";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Disputes" };

async function Disputes() {
  const view = await requireFynix();
  return <DisputesTable rows={await listOpenDisputes(getDomain(), view.actor)} canWrite={view.canWrite} />;
}

export default function DisputesPage() {
  return (
    <>
      <FynixPageHeader title="Disputes" subtitle="Delivered leads a client has disputed, waiting for Fynix to decide" />
      <Suspense fallback={<ListBodySkeleton />}>
        <Disputes />
      </Suspense>
    </>
  );
}
