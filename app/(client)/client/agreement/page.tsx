import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { AgreementsView } from "@/components/agreements/agreements-view";
import { PageHeader } from "@/components/kit/page-header";
import { requireClient } from "@/server/client/session";
import { getDatabase } from "@/server/db/client";
import { listCurrentAgreements } from "@/server/domain/agreements-tenant";

export const metadata: Metadata = { title: "Agreement" };

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

async function Agreement() {
  const view = await requireClient();
  const agreements = await listCurrentAgreements(getDatabase("leads_client").db, view.actor, "client");
  const waiting = agreements.filter((row) => row.acceptedAt === null).length;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Agreement"
        description={
          agreements.length === 0
            ? "Your meeting targets, dispute window and rules for each campaign."
            : waiting > 0
              ? `${waiting} ${waiting === 1 ? "agreement is" : "agreements are"} waiting for you to accept. Targets, dispute window and rules are below.`
              : "Your meeting targets, dispute window and rules for each campaign. All are accepted."
        }
      />
      <AgreementsView
        canAccept={view.canWrite}
        emptyText="Fynix publishes the agreement for each campaign. It will appear here for you to accept."
        agreements={agreements.map((row) => ({ ...row, publishedOn: DATE.format(row.publishedAt), acceptedOn: row.acceptedAt === null ? null : DATE.format(row.acceptedAt) }))}
      />
    </div>
  );
}

export default function ClientAgreementPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Agreement />
    </Suspense>
  );
}
