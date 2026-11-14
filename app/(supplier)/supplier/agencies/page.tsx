import type { Metadata } from "next";
import { UsersThree } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/fynix/empty-state";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { requireSupplier } from "@/server/supplier/session";

export const metadata: Metadata = { title: "Partner Agencies" };

export default async function SupplierAgenciesPage() {
  await requireSupplier();
  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader title="Partner Agencies" subtitle="Manage your agency network, allocate campaign shares and invite members." />
      <div className="rounded-lg bg-surface p-6 shadow-raised">
        <EmptyState icon={UsersThree} title="Agencies network ready">
          Partner agencies work under your supplier contract and receive allocated monthly shares.
        </EmptyState>
      </div>
    </div>
  );
}
