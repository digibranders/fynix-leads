import type { Metadata } from "next";
import { Suspense } from "react";
import { AddCoordinatorButton } from "@/components/fynix/coordinators/coordinator-actions";
import { CoordinatorsTable } from "@/components/fynix/coordinators/coordinators-table";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { parseCoordinatorFilter } from "@/lib/fynix/coordinators";
import { getDomain } from "@/server/domain";
import { listCoordinatorRows } from "@/server/domain/coordinator-overview";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Coordinators" };

const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Coordinators({ searchParams }: { searchParams: PageProps<"/fynix/coordinators">["searchParams"] }) {
  const view = await requireFynix();
  const params = await searchParams;
  const rows = await listCoordinatorRows(getDomain(), view.actor);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Coordinators" description="Agencies that work with Fynix directly, and the partner agencies they bring in." actions={view.canWrite ? <AddCoordinatorButton /> : null} />
      <CoordinatorsTable rows={rows} filter={parseCoordinatorFilter(one(params.status))} query={one(params.q) ?? ""} canWrite={view.canWrite} />
    </div>
  );
}

export default function CoordinatorsPage({ searchParams }: PageProps<"/fynix/coordinators">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Coordinators searchParams={searchParams} />
    </Suspense>
  );
}
