import { Suspense } from "react";
import { CoordinatorTitle } from "@/components/fynix/coordinators/coordinator-title";
import { HeaderSkeleton } from "@/components/kit/skeletons";
import { loadCoordinator } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

async function Title({ params }: { params: LayoutProps<"/fynix/coordinators/[ref]">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  return <CoordinatorTitle coordinator={await loadCoordinator(ref, view.actor.userId)} canWrite={view.canWrite} />;
}

/** The title and tabs sit in their own boundary, so a tab's content does not wait for them. Each tab asks for the coordinator itself (one shared read). */
export default function CoordinatorLayout({ children, params }: LayoutProps<"/fynix/coordinators/[ref]">) {
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={<HeaderSkeleton />}>
        <Title params={params} />
      </Suspense>
      {children}
    </div>
  );
}
