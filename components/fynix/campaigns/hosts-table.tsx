import { Info, UserCircle, UserPlus } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { Person } from "@/components/kit/person";
import { StatusChip } from "@/components/kit/status-chip";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { blockParts, capitalise, weekSummary } from "@/lib/fynix/format";
import type { HostCandidate, HostView } from "@/server/domain/campaign-overview";
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
  /** The page that invites a person into the client, offered when nobody there can be a host yet. */
  inviteHref: string;
};

const hostHref = (reference: string, memberId: string): string => `/fynix/campaigns/${reference}/hosts?host=${memberId}`;

/** The campaign's hosts: name and title, a summary of the weekly hours, the next blocked time and whether they are taking meetings. Below `md` a row is two lines. */
export function HostsTable({ hosts, candidates, campaignId, reference, clientName, campaignZone, selectedId, canWrite, inviteHref }: Props) {
  const addButton = canWrite && candidates.length > 0 ? <AddHostButton campaignId={campaignId} candidates={candidates} clientName={clientName} /> : null;
  const noCandidates = canWrite && candidates.length === 0;

  if (hosts.length === 0) {
    return (
      <Panel aria-label="Meeting hosts">
        <EmptyState
          icon={UserCircle}
          title="No hosts yet"
          action={
            addButton ??
            (canWrite ? (
              <Link href={inviteHref} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                <UserPlus aria-hidden />
                Invite a person
              </Link>
            ) : undefined)
          }
        >
          {candidates.length > 0
            ? `Add the people at ${clientName} who take meetings for this campaign.`
            : `Nobody at ${clientName} can be a host yet. A host is a person who signs in, so invite someone first: they join when they accept the invite. A campaign needs a host before it can go live.`}
        </EmptyState>
      </Panel>
    );
  }

  return (
    <Panel aria-label="Meeting hosts">
      <PanelHeader title="Meeting hosts" count={hosts.length} action={addButton} />
      <p className="px-5 pb-2 text-body text-ink-muted">People at {clientName} who take meetings for this campaign.</p>
      {noCandidates ? <p className="px-5 pb-2 text-caption text-ink-muted">Everyone active at {clientName} is a host already.</p> : null}

      <div className="px-2.5">
        <Table>
          <TableHeader>
            <TableRow className="hover:[&>th]:bg-navy-04">
              <TableHead>Host</TableHead>
              <TableHead className="max-md:hidden">Weekly hours</TableHead>
              <TableHead className="max-lg:hidden">Next block</TableHead>
              <TableHead>Status</TableHead>
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
                  <TableCell className="max-md:max-w-0 max-md:w-full">
                    <Link href={hostHref(reference, host.memberId)} scroll={false} aria-current={selected ? "true" : undefined} className="block rounded-xs after:absolute after:inset-0 after:content-['']">
                      <Person name={host.displayName} sub={host.jobTitle} />
                    </Link>
                    <span className="mt-0.5 block truncate text-caption text-ink-muted md:hidden">{week === null ? "No hours set" : `${week.days}, ${week.detail}`}</span>
                  </TableCell>
                  <TableCell className="max-md:hidden">
                    {week === null ? (
                      <span className="text-ink-muted">No hours set</span>
                    ) : (
                      <span className="block leading-tight">
                        {week.days}
                        <span className="block text-caption text-ink-muted">{week.detail}</span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-lg:hidden">
                    {nextParts === null ? (
                      <span className="text-ink-muted">None</span>
                    ) : (
                      <span className="block leading-tight">
                        {nextParts.day}
                        <span className="block text-caption text-ink-muted">{capitalise(nextParts.detail)}</span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusChip kind="host" status={host.active ? "active" : "paused"} size="sm" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="flex items-start gap-2 px-5 pt-3 pb-4 text-caption text-ink-muted">
        <Info aria-hidden size={14} className="mt-px shrink-0" />
        Agencies see free times only, never the reason for a block.
      </p>
    </Panel>
  );
}
