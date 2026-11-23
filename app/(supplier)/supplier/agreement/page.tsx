import type { Metadata } from "next";
import { AgreementsView } from "@/components/tenant/agreements-view";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { requireSupplier } from "@/server/supplier/session";
import { getDatabase } from "@/server/db/client";
import { listCurrentAgreements } from "@/server/domain/agreements-tenant";

export const metadata: Metadata = { title: "Agreement" };

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function SupplierAgreementPage() {
  const view = await requireSupplier();
  const agreements = await listCurrentAgreements(getDatabase("leads_agency").db, view.actor, "supplier");
  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader title="Supplier Agreement" subtitle="Your delivery targets and counting rules with Fynix, for each campaign." />
      <AgreementsView
        canAccept={view.canWrite}
        emptyText="Fynix publishes your agreement for each campaign. It will appear here for you to accept."
        agreements={agreements.map((row) => ({ ...row, publishedOn: DATE.format(row.publishedAt), acceptedOn: row.acceptedAt === null ? null : DATE.format(row.acceptedAt) }))}
      />
    </div>
  );
}
