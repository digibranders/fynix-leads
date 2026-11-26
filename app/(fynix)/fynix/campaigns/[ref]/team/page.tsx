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

export const metadata: Metadata = { title: "Client team" };

const one = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function Team({ params, searchParams }: { params: PageProps<"/fynix/campaigns/[ref]/team">["params"]; searchParams: PageProps<"/fynix/campaigns/[ref]/team">["searchParams"] }) {
  const view = await requireFynix();
  const { ref } = await params;
  const selectedId = one((await searchParams).person);
  const campaign = await loadCampaign(ref, view.actor.userId);
  const deps = getDomain();
  const hosts = await orNotFound(listCampaignHosts(deps, view.actor, campaign.id));
  const selected = hosts.find((host) => host.memberId === selectedId);

  return (
    <div className={selected === undefined ? undefined : "xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start xl:gap-4"}>
      <HostsTable
        hosts={hosts}
        reference={campaign.publicRef}
        clientName={campaign.clientName}
        campaignZone={campaign.timeZone}
        selectedId={selected?.memberId}
        canWrite={view.canWrite && !isClosed(campaign.status)}
        inviteHref={`/fynix/clients/${campaign.clientRef}/people/new`}
      />
      {selected !== undefined && (
        <HostPanel host={selected} reference={campaign.publicRef} clientName={campaign.clientName} campaignZone={campaign.timeZone} now={deps.now()} canWrite={view.canWrite && !isClosed(campaign.status)} />
      )}
    </div>
  );
}

export default function TeamPage({ params, searchParams }: PageProps<"/fynix/campaigns/[ref]/team">) {
  return (
    <Suspense fallback={<TableSkeleton rows={4} />}>
      <Team params={params} searchParams={searchParams} />
    </Suspense>
  );
}
