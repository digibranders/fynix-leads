import type { Metadata } from "next";
import { AgreementsView } from "@/components/tenant/agreements-view";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { requireClient } from "@/server/client/session";
import { getDatabase } from "@/server/db/client";
import { listCurrentAgreements } from "@/server/domain/agreements-tenant";

export const metadata: Metadata = { title: "Agreement" };

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function ClientAgreementPage() {
  const view = await requireClient();
  const agreements = await listCurrentAgreements(getDatabase("leads_client").db, view.actor, "client");
  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader title="Campaign Agreement" subtitle="Your meeting targets, dispute window and rules for each campaign." />
      <AgreementsView
        canAccept={view.canWrite}
        emptyText="Fynix publishes the agreement for each campaign. It will appear here for you to accept."
        agreements={agreements.map((row) => ({ ...row, publishedOn: DATE.format(row.publishedAt), acceptedOn: row.acceptedAt === null ? null : DATE.format(row.acceptedAt) }))}
      />
    </div>
  );
}
