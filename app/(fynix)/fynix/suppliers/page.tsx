import type { Metadata } from "next";
import { Suspense } from "react";
import { AddSupplierButton } from "@/components/fynix/suppliers/supplier-actions";
import { SuppliersTable } from "@/components/fynix/suppliers/suppliers-table";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { parseSupplierFilter } from "@/lib/fynix/suppliers";
import { getDomain } from "@/server/domain";
import { listSupplierRows } from "@/server/domain/supplier-overview";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Coordinators" };

const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Suppliers({ searchParams }: { searchParams: PageProps<"/fynix/suppliers">["searchParams"] }) {
  const view = await requireFynix();
  const params = await searchParams;
  const rows = await listSupplierRows(getDomain(), view.actor);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Coordinators" description="Coordinators and the partner agencies they bring in." actions={view.canWrite ? <AddSupplierButton /> : null} />
      <SuppliersTable rows={rows} filter={parseSupplierFilter(one(params.status))} query={one(params.q) ?? ""} canWrite={view.canWrite} />
    </div>
  );
}

export default function SuppliersPage({ searchParams }: PageProps<"/fynix/suppliers">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Suppliers searchParams={searchParams} />
    </Suspense>
  );
}
