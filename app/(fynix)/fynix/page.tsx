import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/fynix/card";
import { FynixPageHeader } from "@/components/fynix/page-header";
import { ListBodySkeleton } from "@/components/fynix/skeletons";
import { StatusChip } from "@/components/fynix/status-chip";
import { getDomain } from "@/server/domain";
import { getFynixOverviewMetrics } from "@/server/domain/analytics";
import { listCampaignRows } from "@/server/domain/campaign-overview";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Overview" };

interface Tile {
  readonly label: string;
  readonly value: number;
  readonly note: string;
  readonly href: string;
}

async function Overview() {
  const view = await requireFynix();
  const deps = getDomain();
  const [metrics, campaigns] = await Promise.all([getFynixOverviewMetrics(deps.fynixDb, view.actor), listCampaignRows(deps, view.actor)]);
  const tiles: readonly Tile[] = [
    { label: "Active campaigns", value: metrics.activeCampaignsCount, note: `of ${metrics.totalCampaignsCount} in all`, href: "/fynix/campaigns" },
    { label: "Delivered", value: metrics.deliveredCount, note: `${metrics.totalTargetCount} a month across campaigns`, href: "/fynix/leads" },
    { label: "Waiting on a client", value: metrics.awaitingClientCount, note: "leads not yet accepted or declined", href: "/fynix/leads" },
    { label: "Meetings booked", value: metrics.scheduledCount, note: "scheduled, not yet held", href: "/fynix/meetings" },
    { label: "Disputed", value: metrics.disputedCount, note: "for Fynix to decide", href: "/fynix/disputes" },
    { label: "Over share", value: metrics.overShareCount, note: "leads above an agency's monthly share", href: "/fynix/leads" },
  ];
  const active = campaigns.filter((row) => row.status === "active");

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {tiles.map((tile) => (
          <li key={tile.label}>
            <Link href={tile.href} className="block h-full rounded-lg bg-surface p-4 shadow-raised transition-colors hover:bg-navy-05">
              <p className="text-table text-ink-2">{tile.label}</p>
              <p className="mt-1 text-title font-semibold text-ink">{tile.value}</p>
              <p className="mt-0.5 text-table text-ink-2">{tile.note}</p>
            </Link>
          </li>
        ))}
      </ul>
      <Card aria-labelledby="active-heading" className="p-4">
        <h2 id="active-heading" className="text-value font-semibold tracking-[-0.005em]">
          Active campaigns
        </h2>
        {active.length === 0 ? (
          <p className="mt-2 text-body text-ink-2">No campaign is active.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {active.map((row) => (
              <li key={row.id}>
                <Link href={`/fynix/campaigns/${row.publicRef}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span>
                    <span className="block text-row font-semibold">{row.name}</span>
                    <span className="block text-table text-ink-2">
                      {row.clientName} via {row.supplierName}
                    </span>
                  </span>
                  <StatusChip kind="campaign" status={row.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function FynixHome() {
  return (
    <>
      <FynixPageHeader title="Overview" subtitle="Where every campaign stands today" />
      <Suspense fallback={<ListBodySkeleton />}>
        <Overview />
      </Suspense>
    </>
  );
}
