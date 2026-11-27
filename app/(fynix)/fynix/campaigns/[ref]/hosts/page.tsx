import { redirect } from "next/navigation";

/** The old address of the client team tab, kept so a bookmark still lands. */
export default async function OldCampaignHostsPage({ params }: PageProps<"/fynix/campaigns/[ref]/hosts">): Promise<never> {
  const { ref } = await params;
  redirect(`/fynix/campaigns/${ref}/team`);
}
