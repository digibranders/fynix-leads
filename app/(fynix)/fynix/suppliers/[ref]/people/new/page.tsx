import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FormPage } from "@/components/fynix/forms/form-page";
import { InvitePersonForm } from "@/components/fynix/forms/supplier-forms";
import { PageSkeleton } from "@/components/kit/skeletons";
import { loadSupplier } from "@/server/fynix/records";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Invite person" };

async function Invite({ params }: { params: PageProps<"/fynix/suppliers/[ref]/people/new">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  const backHref = `/fynix/suppliers/${ref}/people`;
  const supplier = await loadSupplier(ref, view.actor.userId);
  if (!view.canWrite || supplier.status !== "active") redirect(backHref);
  const choices = [{ id: supplier.id, name: supplier.name }, ...supplier.agencies.filter((row) => row.status === "active").map((row) => ({ id: row.id, name: row.name }))];
  return (
    <FormPage
      title="Invite person"
      description={`They get an email with a link to set a password. They join ${supplier.name} or one of its agencies.`}
      backHref={backHref}
      backLabel={`People at ${supplier.name}`}
    >
      <InvitePersonForm organisations={choices} page={{ cancelHref: backHref }} />
    </FormPage>
  );
}

export default function InviteSupplierPersonPage({ params }: PageProps<"/fynix/suppliers/[ref]/people/new">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Invite params={params} />
    </Suspense>
  );
}
