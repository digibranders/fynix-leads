import type { Metadata } from "next";
import { PartnersView } from "@/components/tenant/partners-view";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { getDatabase } from "@/server/db/client";
import { listPartnerAgencies } from "@/server/domain/partners-tenant";
import { requireSupplier } from "@/server/supplier/session";

export const metadata: Metadata = { title: "Partner Agencies" };

export default async function SupplierAgenciesPage() {
  const view = await requireSupplier();
  const partners = await listPartnerAgencies(getDatabase("leads_agency").db, view.actor);
  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader title="Partner Agencies" subtitle="The agencies working under your supplier account, and the monthly share of each campaign they hold. Fynix adds agencies; you give them campaigns on the Campaigns page." />
      <PartnersView partners={partners.map((partner) => ({ id: partner.id, publicRef: partner.publicRef, name: partner.name, active: partner.status === "active", shares: partner.shares }))} />
    </div>
  );
}
