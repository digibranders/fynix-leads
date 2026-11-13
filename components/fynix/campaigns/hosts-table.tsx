import { Info, UserCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { blockParts, capitalise, weekSummary } from "@/lib/fynix/format";
import type { HostCandidate, HostView } from "@/server/domain/campaign-overview";
import { Card } from "../card";
import { EmptyState } from "../empty-state";
import { StatusChip } from "../status-chip";
import { AddHostButton } from "./host-actions";

type Props = {
  hosts: readonly HostView[];
  candidates: readonly HostCandidate[];
  campaignId: string;
  reference: string;
  clientName: string;
  campaignZone: string;
  selectedId: string | undefined;
  canWrite: boolean;
};

const hostHref = (reference: string, memberId: string): string => `/fynix/campaigns/${reference}/hosts?host=${memberId}`;

/** The campaign's hosts: name and title, a summary of the weekly hours, the next blocked time and whether they are taking meetings. Below `md` a row is two lines. */
export function HostsTable({ hosts, candidates, campaignId, reference, clientName, campaignZone, selectedId, canWrite }: Props) {
  const addButton =
    canWrite && candidates.length > 0 ? <AddHostButton campaignId={campaignId} candidates={candidates} clientName={clientName} /> : null;
  const noCandidates = canWrite && candidates.length === 0;

  if (hosts.length === 0) {
    return (
      <Card aria-label="Meeting hosts">
        <EmptyState icon={UserCircle} title="No hosts yet" action={addButton ?? undefined}>
          {candidates.length > 0
            ? `Add the people at ${clientName} who take meetings for this campaign.`
            : `Nobody at ${clientName} can be a host yet. People join when they accept an invite.`}
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card aria-labelledby="hosts-heading" className="px-2 pb-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 pt-4 pb-3">
        <h2 id="hosts-heading" className="text-value font-semibold">
          Meeting hosts
        </h2>
        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-navy-05 px-2 text-[12.5px] font-semibold">{hosts.length}</span>
        <p className="min-w-0 flex-1 text-table text-ink-2 max-md:basis-full">People at {clientName} who take meetings for this campaign</p>
        {addButton}
      </div>
      {noCandidates && <p className="px-3.5 pb-2 text-table text-ink-2">Everyone active at {clientName} is a host already.</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Host</TableHead>
            <TableHead className="max-md:hidden">Weekly hours</TableHead>
            <TableHead className="max-md:hidden">Next block</TableHead>
            <TableHead className="pr-3.5">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {hosts.map((host) => {
            const week = weekSummary(host.hours);
            const next = host.blocks[0];
            const nextParts = next === undefined ? null : blockParts(next.startsAt, next.endsAt, host.timeZone ?? campaignZone);
            const selected = host.memberId === selectedId;
            return (
              <TableRow key={host.memberId} data-state={selected ? "selected" : undefined} className="relative">
                <TableCell className="max-md:h-[84px] md:h-[60px]">
                  <Link href={hostHref(reference, host.memberId)} scroll={false} aria-current={selected ? "true" : undefined} className="block rounded-xs text-row font-semibold after:absolute after:inset-0 after:content-['']">
                    {host.displayName}
                  </Link>
                  <span className="block text-table text-ink-2">{host.jobTitle}</span>
                  <span className="mt-0.5 block text-table text-ink-2 md:hidden">{week === null ? "No hours set" : `${week.days}, ${week.detail}`}</span>
                </TableCell>
                <TableCell className="max-md:hidden">
                  {week === null ? (
                    <span className="text-ink-2">No hours set</span>
                  ) : (
                    <>
                      <span className="block">{week.days}</span>
                      <span className="block text-table text-ink-2">{week.detail}</span>
                    </>
                  )}
                </TableCell>
                <TableCell className="max-md:hidden">
                  {nextParts === null ? (
                    <span className="text-ink-2">None</span>
                  ) : (
                    <>
                      <span className="block">{nextParts.day}</span>
                      <span className="block text-table text-ink-2">{capitalise(nextParts.detail)}</span>
                    </>
                  )}
                </TableCell>
                <TableCell className="pr-3.5">
                  <StatusChip kind="host" status={host.active ? "active" : "paused"} size="sm" />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="mt-2 flex items-start gap-2 px-3.5 pt-2 text-table text-ink-2">
        <Info aria-hidden size={15} className="mt-px shrink-0" />
        Agencies see free times only, never the reason for a block.
      </p>
    </Card>
  );
}
