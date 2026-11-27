import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { EditCampaignEditor } from "@/components/fynix/forms/campaign-wizard";
import { FormPage } from "@/components/fynix/forms/form-page";
import { PageSkeleton } from "@/components/kit/skeletons";
import { loadCampaign } from "@/server/fynix/campaign";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Edit campaign" };

async function EditCampaign({ params }: { params: PageProps<"/fynix/campaigns/[ref]/edit">["params"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  const backHref = `/fynix/campaigns/${ref}`;
  if (!view.canWrite) redirect(backHref);
  const campaign = await loadCampaign(ref, view.actor.userId);
  return (
    <FormPage title="Edit campaign" description="Change the details, the brief or the settings. The client and the coordinator stay as they are. Make active, Close and Reopen are on the campaign page." backHref={backHref} backLabel={campaign.name}>
      <EditCampaignEditor campaign={campaign} cancelHref={backHref} />
    </FormPage>
  );
}

export default function EditCampaignPage({ params }: PageProps<"/fynix/campaigns/[ref]/edit">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <EditCampaign params={params} />
    </Suspense>
  );
}
