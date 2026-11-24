import type { Metadata } from "next";
import { Suspense } from "react";
import { DisputesTable } from "@/components/fynix/disputes/disputes-table";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { getDomain } from "@/server/domain";
import { listOpenDisputes } from "@/server/domain/dispute-overview";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Disputes" };

async function Disputes() {
  const view = await requireFynix();
  const rows = await listOpenDisputes(getDomain(), view.actor);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Disputes"
        description={rows.length === 0 ? "Delivered leads a client has disputed wait here for Fynix to decide." : `${rows.length} delivered ${rows.length === 1 ? "lead is" : "leads are"} disputed and waiting for Fynix to decide.`}
      />
      <DisputesTable rows={rows} canWrite={view.canWrite} />
    </div>
  );
}

export default function DisputesPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Disputes />
    </Suspense>
  );
}
