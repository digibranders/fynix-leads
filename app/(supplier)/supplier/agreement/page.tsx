import type { Metadata } from "next";
import { Suspense } from "react";
import { AgreementsView } from "@/components/agreements/agreements-view";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { requireSupplier } from "@/server/supplier/session";
import { getDatabase } from "@/server/db/client";
import { loadAgreementCards } from "@/server/domain/agreement-cards";

export const metadata: Metadata = { title: "Agreement" };

async function Agreement() {
  const view = await requireSupplier();
  const cards = await loadAgreementCards(getDatabase("leads_agency").db, view.actor);
  const waiting = cards.filter((card) => card.pending !== null && card.pending.ownSide === null && !card.closed).length;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Agreement"
        description={
          cards.length === 0
            ? "Your delivery targets and counting rules with Fynix, for each campaign."
            : waiting > 0
              ? `${waiting} ${waiting === 1 ? "agreement is" : "agreements are"} waiting for you to accept. Delivery targets and counting rules are below.`
              : "Your delivery targets and counting rules with Fynix, for each campaign. All are accepted."
        }
      />
      <AgreementsView
        canAccept={view.canWrite}
        emptyText="Fynix publishes your agreement for each campaign. It will appear here for you to accept."
        cards={cards}
        otherLabel="The client"
      />
    </div>
  );
}

export default function SupplierAgreementPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Agreement />
    </Suspense>
  );
}
