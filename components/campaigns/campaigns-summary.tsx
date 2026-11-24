import { MiniStat } from "@/components/kit/stat";
import type { TenantCampaign } from "@/server/domain/campaigns-tenant";

/** The three figures above a campaign list. They count active campaigns only, and the labels say so. Delivered here is read from the cards. */
export function CampaignsSummary({ campaigns }: { readonly campaigns: readonly TenantCampaign[] }) {
  if (campaigns.length === 0) return null;
  const active = campaigns.filter((row) => row.status === "active");
  const delivered = active.reduce((sum, row) => sum + row.delivered, 0);
  const inProgress = active.reduce((sum, row) => sum + row.inProgress, 0);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <MiniStat label="Active campaigns" value={active.length} foot={`${campaigns.length} in total`} />
      <MiniStat label="Accepted so far, active campaigns" value={delivered} foot="Accepted and counted" tone="green" />
      <MiniStat label="In progress, active campaigns" value={inProgress} foot="Waiting, booked or awaiting an outcome" tone="blue" />
    </div>
  );
}
