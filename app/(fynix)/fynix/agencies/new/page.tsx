import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FormPage } from "@/components/fynix/forms/form-page";
import { TermsNotice } from "@/components/fynix/forms/terms-notice";
import { AddAgencyForm } from "@/components/fynix/forms/coordinator-forms";
import { PageSkeleton } from "@/components/kit/skeletons";
import { getDomain } from "@/server/domain";
import { listCampaignChoices } from "@/server/domain/campaign-overview";
import { termsMissing } from "@/server/fynix/terms";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Add agency" };

/** `?coordinator=<id>` fixes the coordinator (the button on a coordinator's page sends it); without it the form asks. */
async function NewAgency({ searchParams }: { searchParams: PageProps<"/fynix/agencies/new">["searchParams"] }) {
  const view = await requireFynix();
  const missing = await termsMissing(view, "agency");
  if (!view.canWrite) redirect("/fynix/agencies");
  const params = await searchParams;
  const { coordinators } = await listCampaignChoices(getDomain(), view.actor);
  const wanted = typeof params.coordinator === "string" ? coordinators.find((row) => row.id === params.coordinator) : undefined;
  const backHref = "/fynix/agencies";
  return (
    <FormPage
      title="Add agency"
      description={wanted === undefined ? "A partner agency is one person who works under a coordinator. They get an email invite to sign in." : `A partner agency that works under ${wanted.name}. They get an email invite to sign in.`}
      backHref={backHref}
      backLabel="Agencies"
    >
      <TermsNotice missing={missing} side="coordinators and agencies" />
      <AddAgencyForm page={{ cancelHref: backHref }} coordinators={coordinators} {...(wanted === undefined ? {} : { coordinatorId: wanted.id })} />
    </FormPage>
  );
}

export default function NewAgencyPage({ searchParams }: PageProps<"/fynix/agencies/new">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <NewAgency searchParams={searchParams} />
    </Suspense>
  );
}
