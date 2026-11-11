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
import { primaryMeeting } from "@/lib/domain/primary-meeting";
import type { Lead } from "@/lib/domain/types";
import { formatDayInZone, formatInZone, formatTimeInZone, isOutsideWorkingHours, zoneAbbreviation } from "@/lib/time/zones";
import { cn } from "@/lib/utils";

/** Tile titles are h2 where the page title is the only heading above them (the lead record) and h3 under a lead heading (the review panel). */
export type HeadingLevel = 2 | 3;

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

/** Tiles on a tonal pane sit in a narrow column and get more air than tiles on a white panel. */
const tilePad = (tone: TileTone): string => (tone === "on-tonal" ? "px-[22px] py-5" : "px-5 py-[18px]");

function TileTitle({
  id,
  icon: Glyph,
  tone,
  level,
  children,
}: {
  id: string;
  icon: Icon;
  tone: TileTone;
  level: HeadingLevel;
  children: string;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className={cn("flex items-center gap-[9px]", tone === "on-tonal" ? "mb-3.5" : "mb-2.5")}>
      <span
        aria-hidden
        className={cn(
          "grid size-[30px] shrink-0 place-items-center rounded-full text-ink-2",
          tone === "on-white" ? "bg-surface shadow-disc" : "bg-navy-05",
        )}
      >
        <Glyph size={17} />
      </span>
      <Heading id={id} className="text-[14px] leading-5 font-semibold">
        {children}
      </Heading>
    </div>
  );
}

function Details({ tone, children }: { tone: TileTone; children: React.ReactNode }) {
  return (
    <dl
      className={cn(
        "grid items-baseline gap-x-3",
        tone === "on-tonal" ? "grid-cols-[72px_minmax(0,1fr)] gap-y-[11px]" : "grid-cols-[76px_minmax(0,1fr)] gap-y-2.5",
      )}
    >
      {children}
    </dl>
  );
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

type Props = { lead: Lead; viewerZone: string; tone?: TileTone; headingLevel?: HeadingLevel; className?: string };

export function MeetingTile({ lead, viewerZone, tone = "on-white", headingLevel = 3, className }: Props) {
  const meeting = primaryMeeting(lead.meetings);
  const at = meeting ? new Date(meeting.startsAt) : null;
  const prospectZone = lead.prospect.zone;
  const offHours =
    at !== null && (isOutsideWorkingHours(at, viewerZone) || isOutsideWorkingHours(at, prospectZone));

  return (
    <Tile tone={tone} aria-labelledby={`${lead.ref}-meeting`} className={cn(tilePad(tone), className)}>
      <TileTitle id={`${lead.ref}-meeting`} icon={CalendarBlank} tone={tone} level={headingLevel}>
        Meeting
      </TileTitle>
      {meeting && at ? (
        <Details tone={tone}>
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
            <StatusBadge kind="meeting" status={meeting.status} className="align-top text-[14px] leading-5 font-medium" />
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

export function ContactTile({ lead, now, tone = "on-white", headingLevel = 3, className }: Props & { now: Date }) {
  const { prospect } = lead;
  const meeting = primaryMeeting(lead.meetings);
  const at = meeting ? new Date(meeting.startsAt) : now;
  // A narrow tile may break the address after the @ instead of in the middle of a word. -1 when there is no @, which keeps it whole.
  const atSign = prospect.email.indexOf("@");

  return (
    <Tile tone={tone} aria-labelledby={`${lead.ref}-contact`} className={cn(tilePad(tone), className)}>
      <TileTitle id={`${lead.ref}-contact`} icon={IdentificationCard} tone={tone} level={headingLevel}>
        Contact
      </TileTitle>
      <Details tone={tone}>
        <Row label="Email" className={tone === "on-tonal" ? "text-[12.5px] tracking-[-0.005em]" : "text-[13px]"}>
          {prospect.email.slice(0, atSign + 1)}
          <wbr />
          {prospect.email.slice(atSign + 1)}
        </Row>
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
export function QualificationTiles({
  lead,
  tone = "on-white",
  headingLevel = 3,
  className,
}: Pick<Props, "lead" | "tone" | "headingLevel" | "className">) {
  // The group title sits at `headingLevel`, so each answer is one level deeper.
  const Heading = headingLevel === 2 ? "h3" : "h4";
  return (
    <div className={cn("grid grid-cols-1 gap-3", className)}>
      {QUALIFICATION.map(({ key, label, icon: Glyph }) => (
        <Tile
          key={key}
          tone={tone}
          aria-labelledby={`${lead.ref}-${key}`}
          className={tone === "on-tonal" ? "px-[22px] pt-5 pb-[21px]" : "px-5 pt-[15px] pb-4"}
        >
          <Heading id={`${lead.ref}-${key}`} className="mb-1.5 flex items-center gap-2 text-[13px] leading-[18px] font-semibold text-ink-2">
            <Glyph aria-hidden size={18} />
            {label}
          </Heading>
          <p className="text-[14px] leading-[21px] text-pretty">{lead.bant[key]}</p>
        </Tile>
      ))}
    </div>
  );
}
