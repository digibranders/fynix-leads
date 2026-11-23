import { CalendarBlank, Clock, UsersThree } from "@phosphor-icons/react/dist/ssr";

export interface HostView {
  readonly memberId: string;
  readonly name: string;
  readonly jobTitle: string;
  readonly campaigns: readonly string[];
  /** One line per day that has hours, such as "Monday: 09:00 to 17:00". */
  readonly hoursLines: readonly string[];
  readonly timeZone: string | null;
  /** Blocked times from now on, already formatted. */
  readonly blockLines: readonly string[];
}

/** The people who take meetings for the client: what they do, which campaigns, when they are free, and what is blocked. */
export function HostsView({ hosts }: { readonly hosts: readonly HostView[] }) {
  if (hosts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg bg-surface p-8 text-center shadow-raised">
        <span className="grid size-10 place-items-center rounded-full bg-navy-05 text-ink-2"><UsersThree aria-hidden size={20} /></span>
        <p className="text-row font-semibold text-ink">No hosts assigned yet</p>
        <p className="max-w-[44ch] text-table text-ink-2">Fynix assigns the people who take your meetings to each campaign. They will appear here with their hours.</p>
      </div>
    );
  }
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {hosts.map((host) => (
        <li key={host.memberId} className="flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-raised">
          <div className="min-w-0">
            <h2 className="text-value font-semibold text-ink">{host.name}</h2>
            <p className="text-table text-ink-2">{host.jobTitle}</p>
            <p className="mt-1 text-caption text-ink-muted">{host.campaigns.join(", ")}</p>
          </div>
          <section aria-label={`Weekly hours of ${host.name}`} className="rounded-md bg-navy-04 p-4">
            <h3 className="flex items-center gap-2 text-label font-semibold text-ink"><Clock aria-hidden size={16} />Weekly hours{host.timeZone === null ? "" : ` (${host.timeZone})`}</h3>
            {host.hoursLines.length === 0 ? (
              <p className="mt-2 text-table text-ink-2">No hours set, so no meeting can be booked with this person.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1 text-table text-ink-2">
                {host.hoursLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label={`Blocked times of ${host.name}`}>
            <h3 className="flex items-center gap-2 text-label font-semibold text-ink"><CalendarBlank aria-hidden size={16} />Blocked times</h3>
            {host.blockLines.length === 0 ? (
              <p className="mt-1 text-table text-ink-2">Nothing blocked.</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1 text-table text-ink-2">
                {host.blockLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </section>
        </li>
      ))}
    </ul>
  );
}
