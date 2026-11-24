import type { Metadata } from "next";
import { Suspense } from "react";
import { PeopleTable } from "@/components/fynix/people/people-table";
import { InvitePersonButton } from "@/components/fynix/people/people-actions";
import { PageSkeleton } from "@/components/kit/skeletons";
import { loadClient } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Client people" };

async function People({ params }: { params: PageProps<"/fynix/clients/[ref]/people">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  const client = await loadClient(ref, view.actor.userId);
  const canInvite = view.canWrite && client.status === "active";
  return (
    <PeopleTable
      people={client.people}
      canWrite={view.canWrite}
      selfUserId={view.actor.userId}
      action={canInvite ? <InvitePersonButton organisations={[{ id: client.id, name: client.name }]} description={`They get an email with a link to set a password. They join ${client.name}.`} /> : null}
    />
  );
}

export default function ClientPeoplePage({ params }: PageProps<"/fynix/clients/[ref]/people">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <People params={params} />
    </Suspense>
  );
}
