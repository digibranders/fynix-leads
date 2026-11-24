import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/kit/skeletons";
import { AgreementsView } from "@/components/agreements/agreements-view";
import { PageHeader } from "@/components/kit/page-header";
import { requireClient } from "@/server/client/session";
import { getDatabase } from "@/server/db/client";
import { loadAgreementCards } from "@/server/domain/agreement-cards";

export const metadata: Metadata = { title: "Agreement" };

async function Agreement() {
  const view = await requireClient();
  const cards = await loadAgreementCards(getDatabase("leads_client").db, view.actor);
  const waiting = cards.filter((card) => card.pending !== null && card.pending.ownSide === null && !card.closed).length;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Agreement"
        description={
          cards.length === 0
            ? "Your meeting targets, dispute window and rules for each campaign."
            : waiting > 0
              ? `${waiting} ${waiting === 1 ? "agreement is" : "agreements are"} waiting for you to accept. Targets, dispute window and rules are below.`
              : "Your meeting targets, dispute window and rules for each campaign. All are accepted."
        }
      />
      <AgreementsView
        canAccept={view.canWrite}
        emptyText="Fynix publishes the agreement for each campaign. It will appear here for you to accept."
        cards={cards}
        otherLabel="The coordinator"
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
