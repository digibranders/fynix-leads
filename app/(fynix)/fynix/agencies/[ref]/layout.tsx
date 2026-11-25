import { Suspense } from "react";
import { AgencyTitle } from "@/components/fynix/agencies/agency-title";
import { HeaderSkeleton } from "@/components/kit/skeletons";
import { loadAgency } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

async function Title({ params }: { params: LayoutProps<"/fynix/agencies/[ref]">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  return <AgencyTitle agency={await loadAgency(ref, view.actor.userId)} canWrite={view.canWrite} />;
}

/** The title and tabs sit in their own boundary, so a tab's content does not wait for them. Each tab asks for the agency itself (one shared read). */
export default function AgencyLayout({ children, params }: LayoutProps<"/fynix/agencies/[ref]">) {
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={<HeaderSkeleton />}>
        <Title params={params} />
      </Suspense>
      {children}
    </div>
  );
}
