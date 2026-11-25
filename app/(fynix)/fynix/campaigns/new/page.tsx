import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CreateCampaignForm } from "@/components/fynix/forms/campaign-forms";
import { FormPage } from "@/components/fynix/forms/form-page";
import { PageSkeleton } from "@/components/kit/skeletons";
import { getDomain } from "@/server/domain";
import { listCampaignChoices } from "@/server/domain/campaign-overview";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "New campaign" };

async function NewCampaign() {
  const view = await requireFynix();
  if (!view.canWrite) redirect("/fynix/campaigns");
  const choices = await listCampaignChoices(getDomain(), view.actor);
  return (
    <FormPage
      title="New campaign"
      description="Choose the client and the coordinator, then set the dates, targets and brief. It starts as a draft."
      backHref="/fynix/campaigns"
      backLabel="Campaigns"
    >
      <CreateCampaignForm choices={choices} page={{ cancelHref: "/fynix/campaigns" }} />
    </FormPage>
  );
}

export default function NewCampaignPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <NewCampaign />
    </Suspense>
  );
}
