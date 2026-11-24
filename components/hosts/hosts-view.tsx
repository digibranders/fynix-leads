import Link from "next/link";
import { CalendarX, Clock, UsersThree } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { Person } from "@/components/kit/person";
import { When } from "@/components/kit/when";
import { cn } from "@/lib/utils";

export interface HostDay {
  readonly day: string;
  /** Free windows of that day, such as "09:00 to 17:00". Empty when the host is off. */
  readonly ranges: readonly string[];
}

export interface HostBlock {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly note: string | null;
}

export interface HostView {
  readonly memberId: string;
  readonly name: string;
  readonly jobTitle: string;
  readonly campaigns: readonly string[];
  /** Monday to Sunday, in the host's own time zone. */
  readonly week: readonly HostDay[];
  readonly timeZone: string | null;
  /** Blocked times from now on, as ISO moments. */
  readonly blocks: readonly HostBlock[];
}

/** The people who take meetings: a list on the left, and on the right what they do, when they are free and what is blocked. Selection is `?host=`. */
export function HostsView({ hosts, selectedId, basePath }: { readonly hosts: readonly HostView[]; readonly selectedId?: string; readonly basePath: string }) {
  if (hosts.length === 0) {
    return (
      <Panel>
        <EmptyState icon={UsersThree} title="No hosts assigned yet">
          Fynix assigns the people who take your meetings to each campaign. They will appear here with their hours.
        </EmptyState>
      </Panel>
    );
  }
  const selected = hosts.find((host) => host.memberId === selectedId) ?? hosts[0];
  const hasHours = selected.week.some((entry) => entry.ranges.length > 0);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[var(--queue-w)_minmax(0,1fr)]">
      <Panel aria-label="Hosts" className="p-2">
        <ul className="flex flex-col gap-0.5">
          {hosts.map((host) => {
            const here = host.memberId === selected.memberId;
            return (
              <li key={host.memberId}>
                <Link
                  href={`${basePath}?host=${encodeURIComponent(host.memberId)}`}
                  scroll={false}
                  aria-current={here ? "true" : undefined}
                  className={cn(
                    "relative flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors",
                    here ? "bg-selected before:absolute before:top-3 before:bottom-3 before:left-0 before:w-[3px] before:rounded-r-full before:bg-peach" : "hover:bg-navy-04",
                  )}
                >
                  <Person name={host.name} sub={host.jobTitle} className="flex-1" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Panel>

      <div className="flex min-w-0 flex-col gap-4">
        <Panel aria-label={selected.name} className="p-6">
          <h2 className="text-name font-semibold tracking-title text-balance">{selected.name}</h2>
          <p className="mt-0.5 text-lead text-ink-muted">{selected.jobTitle}</p>
          {selected.campaigns.length > 0 ? (
            <ul aria-label="Campaigns" className="mt-3 flex flex-wrap gap-1.5">
              {selected.campaigns.map((name) => (
                <li key={name} className="rounded-xs bg-navy-05 px-2 py-0.5 text-xs font-semibold text-ink-2">
                  {name}
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>

        <Panel aria-label={`Weekly hours of ${selected.name}`}>
          <PanelHeader title="Weekly hours" action={selected.timeZone === null ? undefined : <span className="text-label text-ink-muted">Host time zone: {selected.timeZone}</span>} />
          {hasHours ? (
            <dl className="px-5 pb-4">
              {selected.week.map((entry) => (
                <div key={entry.day} className="flex items-center justify-between gap-4 py-2.5 shadow-[inset_0_-1px_0_var(--line)] last:shadow-none">
                  <dt className="text-body font-semibold text-ink">{entry.day}</dt>
                  <dd className={cn("text-body", entry.ranges.length === 0 ? "text-ink-muted" : "text-ink-2")}>{entry.ranges.length === 0 ? "Off" : entry.ranges.join(", ")}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <EmptyState icon={Clock} title="No hours set">
              No meeting can be booked with this person until Fynix sets their hours.
            </EmptyState>
          )}
        </Panel>

        <Panel aria-label={`Blocked times of ${selected.name}`}>
          <PanelHeader title="Blocked times" count={selected.blocks.length} />
          {selected.blocks.length === 0 ? (
            <EmptyState icon={CalendarX} title="Nothing blocked">
              Time off and other blocks appear here, shown in your own time zone.
            </EmptyState>
          ) : (
            <ul className="px-2 pb-3">
              {selected.blocks.map((block) => (
                <li key={`${block.startsAt}-${block.endsAt}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 rounded-sm px-3 py-2.5">
                  <span className="text-body font-semibold text-ink">
                    <When at={block.startsAt} /> to <When at={block.endsAt} />
                  </span>
                  {block.note ? <span className="text-label text-ink-muted">{block.note}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
