import type { Metadata } from "next";
import { Suspense } from "react";
import { HostPanel } from "@/components/fynix/campaigns/host-panel";
import { HostsTable } from "@/components/fynix/campaigns/hosts-table";
import { TableSkeleton } from "@/components/kit/skeletons";
import { getDomain } from "@/server/domain";
import { listCampaignHosts } from "@/server/domain/campaign-overview";
import { loadCampaign } from "@/server/fynix/campaign";
import { isClosed } from "@/lib/campaign-status";
import { orNotFound, requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Campaign hosts" };

const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Hosts({ params, searchParams }: { params: PageProps<"/fynix/campaigns/[ref]/hosts">["params"]; searchParams: PageProps<"/fynix/campaigns/[ref]/hosts">["searchParams"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  const selectedId = one((await searchParams).host);
  const campaign = await loadCampaign(ref, view.actor.userId);
  const deps = getDomain();
  const { hosts, candidates } = await orNotFound(listCampaignHosts(deps, view.actor, campaign.id));
  const selected = hosts.find((host) => host.memberId === selectedId);

  return (
    <div className={selected === undefined ? undefined : "xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start xl:gap-4"}>
      <HostsTable
        hosts={hosts}
        candidates={candidates}
        campaignId={campaign.id}
        reference={campaign.publicRef}
        clientName={campaign.clientName}
        campaignZone={campaign.timeZone}
        selectedId={selected?.memberId}
        canWrite={view.canWrite && !isClosed(campaign.status)}
      />
      {selected !== undefined && (
        <HostPanel host={selected} reference={campaign.publicRef} campaignId={campaign.id} clientName={campaign.clientName} campaignZone={campaign.timeZone} now={deps.now()} canWrite={view.canWrite && !isClosed(campaign.status)} />
      )}
    </div>
  );
}

export default function HostsPage({ params, searchParams }: PageProps<"/fynix/campaigns/[ref]/hosts">) {
  return (
    <Suspense fallback={<TableSkeleton rows={4} />}>
      <Hosts params={params} searchParams={searchParams} />
    </Suspense>
  );
}
