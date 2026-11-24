import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientOverview } from "@/components/fynix/clients/client-overview";
import { PageSkeleton } from "@/components/kit/skeletons";
import { loadClient } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Client" };

async function Overview({ params }: { params: PageProps<"/fynix/clients/[ref]">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  return <ClientOverview client={await loadClient(ref, view.actor.userId)} canWrite={view.canWrite} />;
}

export default function ClientOverviewPage({ params }: PageProps<"/fynix/clients/[ref]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Overview params={params} />
    </Suspense>
  );
}
