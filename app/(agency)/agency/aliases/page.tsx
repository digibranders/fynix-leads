import type { Metadata } from "next";
import { IdentificationBadge } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/fynix/empty-state";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { requireAgency } from "@/server/agency/session";

export const metadata: Metadata = { title: "My Aliases" };

export default async function AgencyAliasesPage() {
  await requireAgency();
  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader title="My Client-Brand Aliases" subtitle="Manage your verified prospect-facing identities." />
      <div className="rounded-lg bg-surface p-6 shadow-raised">
        <EmptyState icon={IdentificationBadge} title="No aliases configured yet">
          Add an alias for each client brand you book for and verify your mailbox to activate it.
        </EmptyState>
      </div>
    </div>
  );
}
