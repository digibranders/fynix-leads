import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FormPage } from "@/components/fynix/forms/form-page";
import { TermsNotice } from "@/components/fynix/forms/terms-notice";
import { InvitePersonForm } from "@/components/fynix/forms/coordinator-forms";
import { PageSkeleton } from "@/components/kit/skeletons";
import { loadClient } from "@/server/fynix/records";
import { termsMissing } from "@/server/fynix/terms";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Invite person" };

async function Invite({ params }: { params: PageProps<"/fynix/clients/[ref]/people/new">["params"] }) {
  const view = await requireFynix();
  const missing = await termsMissing(view, "client");
  const { ref } = await params;
  const backHref = `/fynix/clients/${ref}/people`;
  const client = await loadClient(ref, view.actor.userId);
  if (!view.canWrite || client.status !== "active") redirect(backHref);
  return (
    <FormPage title="Invite person" description={`They get an email with a link to set a password. They join ${client.name}.`} backHref={backHref} backLabel={`People at ${client.name}`}>
      <TermsNotice missing={missing} side="clients" />
      <InvitePersonForm organisations={[{ id: client.id, name: client.name }]} showAlias={false} page={{ cancelHref: backHref }} />
    </FormPage>
  );
}

export default function InviteClientPersonPage({ params }: PageProps<"/fynix/clients/[ref]/people/new">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Invite params={params} />
    </Suspense>
  );
}
