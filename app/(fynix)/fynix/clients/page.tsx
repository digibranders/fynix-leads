import type { Metadata } from "next";
import { Suspense } from "react";
import { AddClientButton } from "@/components/fynix/clients/client-actions";
import { ClientsTable } from "@/components/fynix/clients/clients-table";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { getDomain } from "@/server/domain";
import { listClientRows } from "@/server/domain/client-overview";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Clients" };

async function Clients({ searchParams }: { searchParams: PageProps<"/fynix/clients">["searchParams"] }) {
  const view = await requireFynix();
  const params = await searchParams;
  const rows = await listClientRows(getDomain(), view.actor);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Clients" description="The companies that buy meetings." actions={view.canWrite ? <AddClientButton /> : null} />
      <ClientsTable rows={rows} query={typeof params.q === "string" ? params.q : ""} canWrite={view.canWrite} />
    </div>
  );
}

export default function ClientsPage({ searchParams }: PageProps<"/fynix/clients">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Clients searchParams={searchParams} />
    </Suspense>
  );
}
