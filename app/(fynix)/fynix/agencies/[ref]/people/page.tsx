import type { Metadata } from "next";
import { Suspense } from "react";
import { InvitePersonButton } from "@/components/fynix/people/people-actions";
import { PeopleTable } from "@/components/fynix/people/people-table";
import { PageSkeleton } from "@/components/kit/skeletons";
import { loadAgency } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Agency people" };

async function People({ params }: { params: PageProps<"/fynix/agencies/[ref]/people">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  const agency = await loadAgency(ref, view.actor.userId);
  return (
    <PeopleTable
      people={agency.people}
      canWrite={view.canWrite}
      selfUserId={view.actor.userId}
      action={
        view.canWrite && agency.status === "active" ? (
          <InvitePersonButton organisations={[{ id: agency.id, name: agency.name }]} kind="agencies" description={`They get an email with a link to set a password. They join ${agency.name}.`} />
        ) : null
      }
    />
  );
}

export default function AgencyPeoplePage({ params }: PageProps<"/fynix/agencies/[ref]/people">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <People params={params} />
    </Suspense>
  );
}
