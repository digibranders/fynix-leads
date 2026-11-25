import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FormPage } from "@/components/fynix/forms/form-page";
import { AddAgencyForm } from "@/components/fynix/forms/supplier-forms";
import { PageSkeleton } from "@/components/kit/skeletons";
import { getDomain } from "@/server/domain";
import { listCampaignChoices } from "@/server/domain/campaign-overview";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Add agency" };

/** `?coordinator=<id>` fixes the coordinator (the button on a coordinator's page sends it); without it the form asks. */
async function NewAgency({ searchParams }: { searchParams: PageProps<"/fynix/agencies/new">["searchParams"] }) {
  const view = await requireFynix();
  if (!view.canWrite) redirect("/fynix/agencies");
  const params = await searchParams;
  const { suppliers } = await listCampaignChoices(getDomain(), view.actor);
  const wanted = typeof params.coordinator === "string" ? suppliers.find((row) => row.id === params.coordinator) : undefined;
  const backHref = "/fynix/agencies";
  return (
    <FormPage
      title="Add agency"
      description={wanted === undefined ? "A partner agency works under a coordinator." : `A partner agency that works under ${wanted.name}.`}
      backHref={backHref}
      backLabel="Agencies"
    >
      <AddAgencyForm page={{ cancelHref: backHref }} coordinators={suppliers} {...(wanted === undefined ? {} : { supplierId: wanted.id })} />
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
