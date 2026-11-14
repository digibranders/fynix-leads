import type { Metadata } from "next";
import { Handshake } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/fynix/empty-state";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { requireSupplier } from "@/server/supplier/session";

export const metadata: Metadata = { title: "Agreement" };

export default async function SupplierAgreementPage() {
  await requireSupplier();
  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader title="Supplier Agreement" subtitle="Your meeting target Y and delivery contract with Fynix." />
      <div className="rounded-lg bg-surface p-6 shadow-raised">
        <EmptyState icon={Handshake} title="Supplier Agreement Active">
          Your delivery commitment and counting rules are active. Revised versions are accepted here.
        </EmptyState>
      </div>
    </div>
  );
}
