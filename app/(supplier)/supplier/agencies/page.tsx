import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { PartnersView } from "@/components/partners/partners-view";
import { getDatabase } from "@/server/db/client";
import { listPartnerAgencies } from "@/server/domain/partners-tenant";
import { requireSupplier } from "@/server/supplier/session";

export const metadata: Metadata = { title: "Partner agencies" };

async function Agencies() {
  const view = await requireSupplier();
  const partners = await listPartnerAgencies(getDatabase("leads_agency").db, view.actor);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Partner agencies"
        description="The agencies working under your supplier account, and the monthly share of each campaign they hold. Fynix adds agencies; you give them campaigns on the Campaigns page."
      />
      <PartnersView partners={partners.map((partner) => ({ id: partner.id, publicRef: partner.publicRef, name: partner.name, active: partner.status === "active", shares: partner.shares }))} />
    </div>
  );
}

export default function SupplierAgenciesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Agencies />
    </Suspense>
  );
}
