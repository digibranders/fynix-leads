import { Suspense } from "react";
import { SupplierTitle } from "@/components/fynix/suppliers/supplier-title";
import { HeaderSkeleton } from "@/components/kit/skeletons";
import { loadSupplier } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

async function Title({ params }: { params: LayoutProps<"/fynix/suppliers/[ref]">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  return <SupplierTitle supplier={await loadSupplier(ref, view.actor.userId)} canWrite={view.canWrite} />;
}

/** The title and tabs sit in their own boundary, so a tab's content does not wait for them. Each tab asks for the coordinator itself (one shared read). */
export default function SupplierLayout({ children, params }: LayoutProps<"/fynix/suppliers/[ref]">) {
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={<HeaderSkeleton />}>
        <Title params={params} />
      </Suspense>
      {children}
    </div>
  );
}
