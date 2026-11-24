import type { Metadata } from "next";
import { Suspense } from "react";
import { ExclusionList } from "@/components/exclusions/exclusion-list";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { requireClient } from "@/server/client/session";
import { getDatabase } from "@/server/db/client";
import { listClientExclusions } from "@/server/domain/exclusions";

export const metadata: Metadata = { title: "Exclusions" };

async function Exclusions() {
  const view = await requireClient();
  const entries = await listClientExclusions(getDatabase("leads_client").db, view.actor);
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title="Exclusions" description="Domains and companies that agencies may not send. A lead that matches one is refused." />
      <ExclusionList entries={entries} clientOrgId={view.actor.orgId} canWrite={view.canWrite} />
    </div>
  );
}

export default function ExclusionsPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Exclusions />
    </Suspense>
  );
}
