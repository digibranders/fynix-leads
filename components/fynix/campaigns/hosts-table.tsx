import { Info, UserCircle, UserPlus } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { Person } from "@/components/kit/person";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { blockParts, capitalise, weekSummary } from "@/lib/fynix/format";
import type { HostView } from "@/server/domain/campaign-overview";

type Props = {
  hosts: readonly HostView[];
  reference: string;
  clientName: string;
  campaignZone: string;
  selectedId: string | undefined;
  canWrite: boolean;
  /** The page that invites a person into the client, offered when nobody is there yet. */
  inviteHref: string;
};

const personHref = (reference: string, memberId: string): string => `/fynix/campaigns/${reference}/team?person=${memberId}`;

/** The client team of a campaign: name and title, a summary of the weekly hours and the next blocked time. Below `md` a row is two lines. */
export function HostsTable({ hosts, reference, clientName, campaignZone, selectedId, canWrite, inviteHref }: Props) {

  if (hosts.length === 0) {
    return (
      <Panel aria-label="Client team">
        <EmptyState
          icon={UserCircle}
          title="No team members yet"
          action={
            canWrite ? (
              <Link href={inviteHref} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                <UserPlus aria-hidden />
                Invite a person
              </Link>
            ) : undefined
          }
        >
          {`Nobody at ${clientName} has joined yet. A person joins when they accept an invite. A campaign needs at least one team member before it can go live.`}
        </EmptyState>
      </Panel>
    );
  }

  return (
    <Panel aria-label="Client team">
      <PanelHeader title="Client team" count={hosts.length} />
      <p className="px-5 pb-2 text-body text-ink-muted">People at {clientName} who can take meetings for this campaign.</p>

      <div className="px-2.5">
        <Table>
          <TableHeader>
            <TableRow className="hover:[&>th]:bg-navy-04">
              <TableHead>Team member</TableHead>
              <TableHead className="max-md:hidden">Weekly hours</TableHead>
              <TableHead className="max-lg:hidden">Next block</TableHead>
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
                    <Link href={personHref(reference, host.memberId)} scroll={false} aria-current={selected ? "true" : undefined} className="block rounded-xs after:absolute after:inset-0 after:content-['']">
                      <Person name={host.displayName} sub={host.jobTitle} />
                    </Link>
                    <span className="mt-0.5 block truncate text-caption text-ink-muted md:hidden">{week === null ? "Hours not set, counts as Mon to Fri, 09:00 to 17:00" : `${week.days}, ${week.detail}`}</span>
                  </TableCell>
                  <TableCell className="max-md:hidden">
                    {week === null ? (
                      <span className="block leading-tight text-ink-muted">
                        Not set
                        <span className="block text-caption">Counts as Mon to Fri, 09:00 to 17:00</span>
                      </span>
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
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="flex items-start gap-2 px-5 pt-3 pb-4 text-caption text-ink-muted">
        <Info aria-hidden size={14} className="mt-px shrink-0" />
        Agencies see names and free times only, never the reason for a block.
      </p>
    </Panel>
  );
}
