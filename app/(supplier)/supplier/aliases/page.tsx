import type { Metadata } from "next";
import { AliasesView } from "@/components/tenant/aliases-view";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { requireSupplier } from "@/server/supplier/session";
import { getDatabase } from "@/server/db/client";
import { listAliasIdentities } from "@/server/domain/alias-identity";

export const metadata: Metadata = { title: "Aliases" };

export default async function SupplierAliasesPage() {
  const view = await requireSupplier();
  const aliases = await listAliasIdentities(getDatabase("leads_agency").db, view.actor);
  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader title="Aliases" subtitle="Your prospect-facing identities. Each one is verified through its own mailbox before it can send a lead." />
      <AliasesView
        canWrite={view.canWrite}
        aliases={aliases.map((alias) => ({ publicRef: alias.publicRef, displayName: alias.displayName, jobTitle: alias.jobTitle, clientBrandName: alias.clientBrandName, aliasEmail: alias.aliasEmail, verified: alias.verifiedAt !== null }))}
      />
    </div>
  );
}
