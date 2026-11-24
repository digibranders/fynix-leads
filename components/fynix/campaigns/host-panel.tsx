import { CalendarX, Clock, Globe } from "@phosphor-icons/react/dist/ssr";
import { WEEK_ORDER, blockParts, capitalise, dayName, formatDayHours, zoneLabel } from "@/lib/fynix/format";
import type { HostView } from "@/server/domain/campaign-overview";
import { Tonal } from "@/components/kit/panel";
import { StatusChip } from "@/components/kit/status-chip";
import { SidePanel } from "../side-panel";
import { BlockTimeButton, EditHoursButton, HostPowerButton, RemoveBlockButton } from "./host-actions";

type Props = { host: HostView; reference: string; campaignId: string; clientName: string; campaignZone: string; now: Date; canWrite: boolean };

/** The side panel for one host: the week day by day (a split day shows two ranges), the blocked times to come, and the admin's actions. */
export function HostPanel({ host, reference, campaignId, clientName, campaignZone, now, canWrite }: Props) {
  const zone = host.timeZone ?? campaignZone;

  return (
    <SidePanel
      closeHref={`/fynix/campaigns/${reference}/hosts`}
      label={`${host.displayName}, host`}
      header={
        <>
          <StatusChip kind="host" status={host.active ? "active" : "paused"} />
          <h2 className="mt-3 text-name font-semibold tracking-title break-words">{host.displayName}</h2>
          <p className="mt-0.5 text-body text-ink-muted">
            <b className="font-semibold text-ink">{host.jobTitle}</b> at {clientName}
          </p>
          <p className="mt-2.5 flex items-center gap-2 text-body text-ink-muted">
            <Globe aria-hidden size={17} className="shrink-0" />
            {host.timeZone === null ? `No hours set. Campaign time is ${zoneLabel(campaignZone, now)}` : `Hours in ${zoneLabel(zone, now)}`}
          </p>
        </>
      }
      footer={
        canWrite ? (
          <>
            <BlockTimeButton memberId={host.memberId} hostName={host.displayName} timeZone={zone} />
            <HostPowerButton campaignId={campaignId} memberId={host.memberId} jobTitle={host.jobTitle} active={host.active} />
          </>
        ) : undefined
      }
    >
      <Tonal aria-label="Weekly hours">
        <div className="flex items-center gap-2 pb-2">
          <Clock aria-hidden size={17} className="shrink-0 text-ink-2" />
          <h3 className="text-row font-semibold">Weekly hours</h3>
          {canWrite && (
            <span className="ml-auto">
              <EditHoursButton memberId={host.memberId} hostName={host.displayName} timeZone={zone} windows={host.hours} />
            </span>
          )}
        </div>
        <dl>
          {WEEK_ORDER.map((weekday) => {
            const text = formatDayHours(host.hours, weekday);
            return (
              <div key={weekday} className="flex gap-4 py-2.5 text-table shadow-[inset_0_1px_0_var(--line)] first:shadow-none">
                <dt className="w-10 shrink-0 text-ink-muted">{dayName(weekday)}</dt>
                <dd className={text === null ? "text-ink-muted" : "font-semibold"}>{text ?? "Not available"}</dd>
              </div>
            );
          })}
        </dl>
      </Tonal>

      <Tonal aria-label="Blocked times">
        <div className="flex items-center gap-2 pb-2">
          <CalendarX aria-hidden size={17} className="shrink-0 text-ink-2" />
          <h3 className="text-row font-semibold">Blocked times</h3>
          <span className="ml-auto text-table text-ink-muted">{host.blocks.length} coming up</span>
        </div>
        {host.blocks.length === 0 ? (
          <p className="text-table text-ink-muted">Nothing is blocked.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {host.blocks.map((block) => {
              const parts = blockParts(block.startsAt, block.endsAt, zone);
              const line = `${parts.day}, ${parts.detail}`;
              return (
                <li key={block.id} className="flex items-start gap-3 rounded-sm bg-surface py-2.5 pr-1.5 pl-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-table font-semibold">{capitalise(line)}</p>
                    {block.note !== "" && <p className="mt-0.5 text-table break-words text-ink-muted">{block.note}</p>}
                  </div>
                  {canWrite && <RemoveBlockButton blockId={block.id} label={`Remove the block on ${line}`} />}
                </li>
              );
            })}
          </ul>
        )}
      </Tonal>
    </SidePanel>
  );
}
