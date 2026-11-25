import type { Metadata } from "next";
import { Suspense } from "react";
import { InvitePersonButton } from "@/components/fynix/people/people-actions";
import { PeopleTable } from "@/components/fynix/people/people-table";
import { PageSkeleton } from "@/components/kit/skeletons";
import { loadCoordinator } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Coordinator people" };

async function People({ params }: { params: PageProps<"/fynix/coordinators/[ref]/people">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  const coordinator = await loadCoordinator(ref, view.actor.userId);
  const choices = [{ id: coordinator.id, name: coordinator.name }, ...coordinator.agencies.filter((row) => row.status === "active").map((row) => ({ id: row.id, name: row.name }))];
  return (
    <PeopleTable
      people={coordinator.everyone}
      canWrite={view.canWrite}
      selfUserId={view.actor.userId}
      showOrganisation
      action={
        view.canWrite && coordinator.status === "active" ? (
          <InvitePersonButton href={`/fynix/coordinators/${ref}/people/new`} organisations={choices} kind="agencies" description={`They get an email with a link to set a password. They join ${coordinator.name} or one of its agencies.`} />
        ) : null
      }
    />
  );
}

export default function CoordinatorPeoplePage({ params }: PageProps<"/fynix/coordinators/[ref]/people">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <People params={params} />
    </Suspense>
  );
}
