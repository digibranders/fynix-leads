import type { Metadata } from "next";
import { AliasesView } from "@/components/tenant/aliases-view";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { requireAgency } from "@/server/agency/session";
import { getDatabase } from "@/server/db/client";
import { listAliasIdentities } from "@/server/domain/alias-identity";

export const metadata: Metadata = { title: "My Aliases" };

export default async function AgencyAliasesPage() {
  const view = await requireAgency();
  const aliases = await listAliasIdentities(getDatabase("leads_agency").db, view.actor);
  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader title="My Client-Brand Aliases" subtitle="Your prospect-facing identities. Each one is verified through its own mailbox before it can send a lead." />
      <AliasesView
        canWrite={view.canWrite}
        aliases={aliases.map((alias) => ({ publicRef: alias.publicRef, displayName: alias.displayName, jobTitle: alias.jobTitle, clientBrandName: alias.clientBrandName, aliasEmail: alias.aliasEmail, verified: alias.verifiedAt !== null }))}
      />
    </div>
  );
}
