import type { Metadata } from "next";
import { Suspense } from "react";
import { AddClientButton } from "@/components/fynix/clients/client-actions";
import { ClientsTable } from "@/components/fynix/clients/clients-table";
import { FynixPageHeader } from "@/components/fynix/page-header";
import { ListBodySkeleton } from "@/components/fynix/skeletons";
import { getDomain } from "@/server/domain";
import { listClientRows } from "@/server/domain/client-overview";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Clients" };

async function HeaderActions() {
  const view = await requireFynix();
  return view.canWrite ? <AddClientButton /> : null;
}

async function Clients({ searchParams }: { searchParams: PageProps<"/fynix/clients">["searchParams"] }) {
  const view = await requireFynix();
  const params = await searchParams;
  const rows = await listClientRows(getDomain(), view.actor);
  return <ClientsTable rows={rows} query={typeof params.q === "string" ? params.q : ""} canWrite={view.canWrite} />;
}

export default function ClientsPage({ searchParams }: PageProps<"/fynix/clients">) {
  return (
    <>
      <FynixPageHeader
        title="Clients"
        subtitle="The companies that buy meetings"
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <Suspense fallback={<ListBodySkeleton />}>
        <Clients searchParams={searchParams} />
      </Suspense>
    </>
  );
}
