import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FormPage } from "@/components/fynix/forms/form-page";
import { TermsNotice } from "@/components/fynix/forms/terms-notice";
import { InvitePersonForm } from "@/components/fynix/forms/coordinator-forms";
import { PageSkeleton } from "@/components/kit/skeletons";
import { loadAgency } from "@/server/fynix/records";
import { termsMissing } from "@/server/fynix/terms";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Invite person" };

async function Invite({ params }: { params: PageProps<"/fynix/agencies/[ref]/people/new">["params"] }) {
  const view = await requireFynix();
  const missing = await termsMissing(view, "agency");
  const { ref } = await params;
  const backHref = `/fynix/agencies/${ref}/people`;
  const agency = await loadAgency(ref, view.actor.userId);
  if (!view.canWrite || agency.status !== "active") redirect(backHref);
  return (
    <FormPage title="Invite person" description={`They get an email with a link to set a password. They join ${agency.name}.`} backHref={backHref} backLabel={`People at ${agency.name}`}>
      <TermsNotice missing={missing} side="coordinators and agencies" />
      <InvitePersonForm organisations={[{ id: agency.id, name: agency.name }]} page={{ cancelHref: backHref }} />
    </FormPage>
  );
}

export default function InviteAgencyPersonPage({ params }: PageProps<"/fynix/agencies/[ref]/people/new">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Invite params={params} />
    </Suspense>
  );
}
