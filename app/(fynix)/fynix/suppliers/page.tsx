import type { Metadata } from "next";
import { Suspense } from "react";
import { AddSupplierButton } from "@/components/fynix/suppliers/supplier-actions";
import { PanelNotFound, SupplierPanel } from "@/components/fynix/suppliers/supplier-panel";
import { SuppliersTable } from "@/components/fynix/suppliers/suppliers-table";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { parseSupplierFilter, suppliersHref } from "@/lib/fynix/suppliers";
import { getDomain } from "@/server/domain";
import { DomainError } from "@/server/domain/errors";
import { listSupplierRows, readSupplierDetail } from "@/server/domain/supplier-overview";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Suppliers" };

const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Suppliers({ searchParams }: { searchParams: PageProps<"/fynix/suppliers">["searchParams"] }) {
  const view = await requireFynix();
  const params = await searchParams;
  const filter = parseSupplierFilter(one(params.status));
  const query = one(params.q) ?? "";
  const selectedRef = one(params.supplier);

  const deps = getDomain();
  const [rows, detail] = await Promise.all([
    listSupplierRows(deps, view.actor),
    selectedRef === undefined
      ? Promise.resolve(null)
      : readSupplierDetail(deps, view.actor, selectedRef).catch((error: unknown) => {
          // An address that names no supplier shows a small note in the panel's place, not the not-found page: the list is still good.
          if (error instanceof DomainError && error.code === "not-found") return "missing" as const;
          throw error;
        }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Suppliers" description="Suppliers and the partner agencies they bring in." actions={view.canWrite ? <AddSupplierButton /> : null} />
      <div className={detail === null ? undefined : "xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start xl:gap-4"}>
        <SuppliersTable rows={rows} filter={filter} query={query} selectedRef={selectedRef} canWrite={view.canWrite} />
        {detail === "missing" && <PanelNotFound closeHref={suppliersHref({ status: filter, q: query })} />}
        {detail !== null && detail !== "missing" && <SupplierPanel detail={detail} filter={filter} query={query} canWrite={view.canWrite} />}
      </div>
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
