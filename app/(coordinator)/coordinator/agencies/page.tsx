import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { AddAgencyButton } from "@/components/team/add-agency-button";
import { PartnersView } from "@/components/partners/partners-view";
import { getDatabase } from "@/server/db/client";
import { listPartnerAgencies } from "@/server/domain/partners-tenant";
import { requireCoordinator } from "@/server/coordinator/session";

export const metadata: Metadata = { title: "Partner agencies" };

async function Agencies() {
  const view = await requireCoordinator();
  const partners = await listPartnerAgencies(getDatabase("leads_agency").db, view.actor);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Partner agencies"
        description="The agencies working under your coordinator account, and the monthly share of each campaign they hold. Add an agency, then give it campaigns on the Campaigns page and invite its people from the Team page."
        actions={view.canWrite ? <AddAgencyButton /> : null}
      />
      <PartnersView canAdd={view.canWrite} partners={partners.map((partner) => ({ id: partner.id, publicRef: partner.publicRef, name: partner.name, active: partner.status === "active", shares: partner.shares }))} />
    </div>
  );
}

export default function CoordinatorAgenciesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Agencies />
    </Suspense>
  );
}
