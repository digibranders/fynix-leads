import { Suspense } from "react";
import { ClientTitle } from "@/components/fynix/clients/client-title";
import { HeaderSkeleton } from "@/components/kit/skeletons";
import { loadClient } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

async function Title({ params }: { params: LayoutProps<"/fynix/clients/[ref]">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  return <ClientTitle client={await loadClient(ref, view.actor.userId)} canWrite={view.canWrite} />;
}

/** The title and tabs sit in their own boundary, so a tab's content does not wait for them. Each tab asks for the client itself (one shared read). */
export default function ClientLayout({ children, params }: LayoutProps<"/fynix/clients/[ref]">) {
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={<HeaderSkeleton />}>
        <Title params={params} />
      </Suspense>
      {children}
    </div>
  );
}
