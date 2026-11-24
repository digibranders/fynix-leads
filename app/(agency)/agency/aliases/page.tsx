import type { Metadata } from "next";
import { Suspense } from "react";
import { AliasesView } from "@/components/aliases/aliases-view";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { getDatabase } from "@/server/db/client";
import { listAliasIdentities } from "@/server/domain/alias-identity";
import { requireAgency } from "@/server/agency/session";

export const metadata: Metadata = { title: "My aliases" };

async function Aliases() {
  const view = await requireAgency();
  const aliases = await listAliasIdentities(getDatabase("leads_agency").db, view.actor);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="My aliases" description="Your prospect-facing identities. Each one is verified through its own mailbox before it can send a lead." />
      <AliasesView
        canWrite={view.canWrite}
        aliases={aliases.map((alias) => ({ publicRef: alias.publicRef, displayName: alias.displayName, jobTitle: alias.jobTitle, clientBrandName: alias.clientBrandName, aliasEmail: alias.aliasEmail, verified: alias.verifiedAt !== null }))}
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
