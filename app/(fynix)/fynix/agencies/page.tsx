import type { Metadata } from "next";
import { Suspense } from "react";
import { AgenciesTable } from "@/components/fynix/agencies/agencies-table";
import { AddAgencyButton } from "@/components/fynix/suppliers/supplier-actions";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { parseSupplierFilter } from "@/lib/fynix/suppliers";
import { getDomain } from "@/server/domain";
import { listAgencyRows } from "@/server/domain/agency-overview";
import { listCampaignChoices } from "@/server/domain/campaign-overview";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Agencies" };

const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Agencies({ searchParams }: { searchParams: PageProps<"/fynix/agencies">["searchParams"] }) {
  const view = await requireFynix();
  const params = await searchParams;
  const deps = getDomain();
  const [rows, choices] = await Promise.all([listAgencyRows(deps, view.actor), listCampaignChoices(deps, view.actor)]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Agencies"
        description="Partner agencies that send leads, each under a coordinator."
        actions={view.canWrite && choices.suppliers.length > 0 ? <AddAgencyButton primary /> : null}
      />
      <AgenciesTable rows={rows} filter={parseSupplierFilter(one(params.status))} query={one(params.q) ?? ""} canWrite={view.canWrite} coordinators={choices.suppliers} />
    </div>
  );
}

export default function AgenciesPage({ searchParams }: PageProps<"/fynix/agencies">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Agencies searchParams={searchParams} />
    </Suspense>
  );
}
