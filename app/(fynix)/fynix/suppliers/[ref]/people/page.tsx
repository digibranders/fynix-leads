import type { Metadata } from "next";
import { Suspense } from "react";
import { InvitePersonButton } from "@/components/fynix/people/people-actions";
import { PeopleTable } from "@/components/fynix/people/people-table";
import { PageSkeleton } from "@/components/kit/skeletons";
import { loadSupplier } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Coordinator people" };

async function People({ params }: { params: PageProps<"/fynix/suppliers/[ref]/people">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  const supplier = await loadSupplier(ref, view.actor.userId);
  const choices = [{ id: supplier.id, name: supplier.name }, ...supplier.agencies.filter((row) => row.status === "active").map((row) => ({ id: row.id, name: row.name }))];
  return (
    <PeopleTable
      people={supplier.everyone}
      canWrite={view.canWrite}
      selfUserId={view.actor.userId}
      showOrganisation
      action={
        view.canWrite && supplier.status === "active" ? (
          <InvitePersonButton organisations={choices} kind="agencies" description={`They get an email with a link to set a password. They join ${supplier.name} or one of its agencies.`} />
        ) : null
      }
    />
  );
}

export default function SupplierPeoplePage({ params }: PageProps<"/fynix/suppliers/[ref]/people">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <People params={params} />
    </Suspense>
  );
}
