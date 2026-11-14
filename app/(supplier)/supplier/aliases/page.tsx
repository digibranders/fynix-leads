import type { Metadata } from "next";
import { IdentificationBadge } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/fynix/empty-state";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { requireSupplier } from "@/server/supplier/session";

export const metadata: Metadata = { title: "Aliases" };

export default async function SupplierAliasesPage() {
  await requireSupplier();
  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader title="Client-Brand Aliases" subtitle="Verified alias identities used by your SDRs to contact prospects under the client brand." />
      <div className="rounded-lg bg-surface p-6 shadow-raised">
        <EmptyState icon={IdentificationBadge} title="No aliases configured yet">
          Create client-brand alias identities and verify them with code verification to begin booking.
        </EmptyState>
      </div>
    </div>
  );
}
