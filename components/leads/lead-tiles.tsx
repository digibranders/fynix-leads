import type { Icon } from "@phosphor-icons/react";
import {
  ArrowSquareOut,
  CalendarBlank,
  Flag,
  IdentificationCard,
  Target,
  Wallet,
  SealCheck,
  Warning,
} from "@phosphor-icons/react/dist/ssr";
import { StatusBadge } from "@/components/status/status-badge";
import type { Lead } from "@/lib/domain/types";
import { formatDayInZone, formatInZone, formatTimeInZone, isOutsideWorkingHours, zoneAbbreviation } from "@/lib/time/zones";
import { cn } from "@/lib/utils";

/** `on-white` sits on a white panel (navy 4% tile). `on-tonal` sits on a tonal pane (white tile that lifts). */
export type TileTone = "on-white" | "on-tonal";

type TileProps = {
  tone?: TileTone;
  className?: string;
  children: React.ReactNode;
  "aria-labelledby"?: string;
};

function Tile({ tone = "on-white", className, children, ...rest }: TileProps) {
  return (
    <section
      {...rest}
      className={cn("rounded-md", tone === "on-white" ? "bg-navy-04" : "bg-surface shadow-tile-lift", className)}
    >
      {children}
    </section>
  );
}

function TileTitle({ id, icon: Glyph, tone, children }: { id: string; icon: Icon; tone: TileTone; children: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-[9px]">
      <span
        aria-hidden
        className={cn(
          "grid size-[30px] shrink-0 place-items-center rounded-full text-ink-2",
          tone === "on-white" ? "bg-surface shadow-[0_1px_2px_rgba(12,30,46,0.06)]" : "bg-navy-05",
        )}
      >
        <Glyph size={17} />
      </span>
      <h3 id={id} className="text-[14px] leading-5 font-semibold">
        {children}
      </h3>
    </div>
  );
}

function Details({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-[76px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2.5">{children}</dl>;
}

function Row({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <>
      <dt className="text-[12.5px] leading-5 font-medium text-ink-muted">{label}</dt>
      <dd className={cn("min-w-0 text-[14px] leading-5 font-medium [overflow-wrap:anywhere]", className)}>{children}</dd>
    </>
  );
}

const Note = ({ children, warn = false }: { children: React.ReactNode; warn?: boolean }) => (
  <span
    className={cn(
      "mt-px flex items-center gap-1 text-[12.5px] leading-[17px] font-normal",
      warn ? "text-amber-text" : "text-ink-2",
    )}
  >
    {children}
  </span>
);

/** "Europe/London" becomes "London", "America/New_York" becomes "New York". */
const cityOf = (zone: string): string => (zone.split("/").pop() ?? zone).replaceAll("_", " ");

type Props = { lead: Lead; viewerZone: string; now: Date; tone?: TileTone; className?: string };

export function MeetingTile({ lead, viewerZone, tone = "on-white", className }: Props) {
  const meeting = lead.meetings[0];
  const at = meeting ? new Date(meeting.startsAt) : null;
  const prospectZone = lead.prospect.zone;
  const offHours =
    at !== null && (isOutsideWorkingHours(at, viewerZone) || isOutsideWorkingHours(at, prospectZone));

  return (
    <Tile tone={tone} aria-labelledby={`${lead.ref}-meeting`} className={cn("px-5 py-[18px]", className)}>
      <TileTitle id={`${lead.ref}-meeting`} icon={CalendarBlank} tone={tone}>
        Meeting
      </TileTitle>
      {meeting && at ? (
        <Details>
          <Row label="When">
            <time dateTime={at.toISOString()}>
              {formatDayInZone(at, viewerZone)}, {formatTimeInZone(at, viewerZone)}
            </time>
            <Note>
              {cityOf(viewerZone)} time ({zoneAbbreviation(at, viewerZone)})
            </Note>
            {prospectZone !== viewerZone && <Note>{formatInZone(at, prospectZone)} for the prospect</Note>}
            {offHours && (
              <Note warn>
                <Warning aria-hidden size={12} weight="fill" />
                Outside working hours for one side
              </Note>
            )}
          </Row>
          <Row label="Status">
            <StatusBadge kind="meeting" status={meeting.status} className="text-[14px] font-medium" />
          </Row>
          <Row label="With">{meeting.repName}</Row>
          <Row label="Length">{meeting.durationMinutes} minutes</Row>
        </Details>
      ) : (
        <p className="text-[14px] leading-5 text-ink-2">No meeting is booked for this lead.</p>
      )}
    </Tile>
  );
}

/** "https://www.linkedin.com/in/tom-whitcombe-91a6d3e" becomes "in/tom-whitcombe-91a6d3e". */
function linkedinHandle(url: string): string {
  try {
    const { pathname } = new URL(url);
    return pathname.replace(/^\/|\/$/g, "") || url;
  } catch {
    return url;
  }
}

export function ContactTile({ lead, now, tone = "on-white", className }: Props) {
  const { prospect } = lead;
  const at = lead.meetings[0] ? new Date(lead.meetings[0].startsAt) : now;

  return (
    <Tile tone={tone} aria-labelledby={`${lead.ref}-contact`} className={cn("px-5 py-[18px]", className)}>
      <TileTitle id={`${lead.ref}-contact`} icon={IdentificationCard} tone={tone}>
        Contact
      </TileTitle>
      <Details>
        <Row label="Email" className="text-[13px]">{prospect.email}</Row>
        <Row label="Phone">{prospect.phone}</Row>
        <Row label="LinkedIn">
          <a
            href={prospect.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-1.5 rounded-xs outline-none hover:underline hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="truncate">{linkedinHandle(prospect.linkedinUrl)}</span>
            <ArrowSquareOut aria-hidden size={14} className="shrink-0 text-ink-muted" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </Row>
        <Row label="Time zone">
          {cityOf(prospect.zone)}, {zoneAbbreviation(at, prospect.zone)}
        </Row>
      </Details>
    </Tile>
  );
}

const QUALIFICATION = [
  { key: "budget", label: "Budget", icon: Wallet },
  { key: "authority", label: "Authority", icon: SealCheck },
  { key: "need", label: "Need", icon: Target },
  { key: "timeline", label: "Timeline", icon: Flag },
] as const;

/** Four BANT tiles. The caller sets the grid with `className`, for example `@xl:grid-cols-2`. */
export function QualificationTiles({ lead, tone = "on-white", className }: Pick<Props, "lead" | "tone" | "className">) {
  return (
    <div className={cn("grid grid-cols-1 gap-3", className)}>
      {QUALIFICATION.map(({ key, label, icon: Glyph }) => (
        <Tile key={key} tone={tone} aria-labelledby={`${lead.ref}-${key}`} className="px-5 pt-[15px] pb-4">
          <h4 id={`${lead.ref}-${key}`} className="mb-1.5 flex items-center gap-2 text-[13px] leading-[18px] font-semibold text-ink-2">
            <Glyph aria-hidden size={18} />
            {label}
          </h4>
          <p className="text-[14px] leading-[21px] text-pretty">{lead.bant[key]}</p>
        </Tile>
      ))}
    </div>
  );
}
