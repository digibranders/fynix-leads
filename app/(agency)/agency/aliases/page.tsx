import type { Metadata } from "next";
import { Suspense } from "react";
import { AliasesView } from "@/components/aliases/aliases-view";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { getDatabase } from "@/server/db/client";
import { listAliasClients, listAliasIdentities } from "@/server/domain/alias-identity";
import { requireAgency } from "@/server/agency/session";

export const metadata: Metadata = { title: "My aliases" };

async function Aliases() {
  const view = await requireAgency();
  const [aliases, clients] = await Promise.all([listAliasIdentities(getDatabase("leads_agency").db, view.actor), listAliasClients(getDatabase("leads_agency").db, view.actor)]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="My aliases" description="Your prospect-facing identities. Each one is verified through its own mailbox before it can send a lead." />
      <AliasesView
        canWrite={view.canWrite}
        clients={clients}
        aliases={aliases.map((alias) => ({ publicRef: alias.publicRef, displayName: alias.displayName, jobTitle: alias.jobTitle, clientBrandName: alias.clientBrandName, aliasEmail: alias.aliasEmail, verified: alias.verifiedAt !== null, clientOrgId: alias.clientOrgId, retired: alias.status !== "active" }))}
      />
    </div>
  );
}

export default function AgencyAliasesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Aliases />
    </Suspense>
  );
}
