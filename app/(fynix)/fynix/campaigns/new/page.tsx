import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CreateCampaignWizard } from "@/components/fynix/forms/campaign-wizard";
import { FormPage } from "@/components/fynix/forms/form-page";
import { PageSkeleton } from "@/components/kit/skeletons";
import { getDomain } from "@/server/domain";
import { listCampaignChoices } from "@/server/domain/campaign-overview";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "New campaign" };

/** `?client=` and `?coordinator=` start the form with that record chosen (the buttons on their Campaigns tabs send them). Anything that is not one of the choices is ignored. */
async function NewCampaign({ searchParams }: { searchParams: PageProps<"/fynix/campaigns/new">["searchParams"] }) {
  const view = await requireFynix();
  if (!view.canWrite) redirect("/fynix/campaigns");
  const params = await searchParams;
  const choices = await listCampaignChoices(getDomain(), view.actor);
  const client = typeof params.client === "string" && choices.clients.some((row) => row.id === params.client) ? params.client : undefined;
  const coordinator = typeof params.coordinator === "string" && choices.coordinators.some((row) => row.id === params.coordinator) ? params.coordinator : undefined;
  return (
    <FormPage
      title="New campaign"
      description="Two steps: the details, then a review of the meeting terms. It starts as a draft."
      backHref="/fynix/campaigns"
      backLabel="Campaigns"
    >
      <CreateCampaignWizard choices={choices} cancelHref="/fynix/campaigns" initial={{ clientId: client, coordinatorId: coordinator }} />
    </FormPage>
  );
}

export default function NewCampaignPage({ searchParams }: PageProps<"/fynix/campaigns/new">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <NewCampaign searchParams={searchParams} />
    </Suspense>
  );
}
