import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FormPage } from "@/components/fynix/forms/form-page";
import { TermsNotice } from "@/components/fynix/forms/terms-notice";
import { InvitePersonForm } from "@/components/fynix/forms/coordinator-forms";
import { PageSkeleton } from "@/components/kit/skeletons";
import { loadCoordinator } from "@/server/fynix/records";
import { termsMissing } from "@/server/fynix/terms";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Invite person" };

async function Invite({ params }: { params: PageProps<"/fynix/coordinators/[ref]/people/new">["params"] }) {
  const view = await requireFynix();
  const missing = await termsMissing(view, "agency");
  const { ref } = await params;
  const backHref = `/fynix/coordinators/${ref}/people`;
  const coordinator = await loadCoordinator(ref, view.actor.userId);
  if (!view.canWrite || coordinator.status !== "active") redirect(backHref);
  const choices = [{ id: coordinator.id, name: coordinator.name }, ...coordinator.agencies.filter((row) => row.status === "active").map((row) => ({ id: row.id, name: row.name }))];
  return (
    <FormPage
      title="Invite person"
      description={`They get an email with a link to set a password. They join ${coordinator.name} or one of its agencies.`}
      backHref={backHref}
      backLabel={`People at ${coordinator.name}`}
    >
      <TermsNotice missing={missing} side="coordinators and agencies" />
      <InvitePersonForm organisations={choices} page={{ cancelHref: backHref }} />
    </FormPage>
  );
}

export default function InviteCoordinatorPersonPage({ params }: PageProps<"/fynix/coordinators/[ref]/people/new">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Invite params={params} />
    </Suspense>
  );
}
