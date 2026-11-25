import type { Metadata } from "next";
import { Suspense } from "react";
import { ActivityPanel } from "@/components/fynix/records/record-panels";
import { PageSkeleton } from "@/components/kit/skeletons";
import { loadAgency } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Agency activity" };

async function Activity({ params }: { params: PageProps<"/fynix/agencies/[ref]/activity">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  return <ActivityPanel rows={(await loadAgency(ref, view.actor.userId)).activity} />;
}

export default function AgencyActivityPage({ params }: PageProps<"/fynix/agencies/[ref]/activity">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Activity params={params} />
    </Suspense>
  );
}
