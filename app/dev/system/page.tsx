import {
  ArrowClockwise,
  ArrowLeft,
  CalendarBlank,
  ChatCircle,
  IdentificationCard,
  PaperPlaneTilt,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { BulletGraph } from "@/components/charts/bullet-graph";
import { Field } from "@/components/dev/field";
import { OverlayDemos } from "@/components/dev/overlay-demos";
import { Group, Section, Specimen } from "@/components/dev/specimen";
import { LeadsTableSkeleton } from "@/components/leads/leads-table-skeleton";
import { ReviewQueueSkeleton } from "@/components/review/review-queue-skeleton";
import { StatusBadge } from "@/components/status/status-badge";
import { TimeInZones } from "@/components/time/time-in-zones";
import { WaitingAge } from "@/components/time/waiting-age";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { REJECTION_REASONS } from "@/lib/domain/rejection-reasons";
import { APPROVAL_STATUSES, MEETING_STATUSES } from "@/lib/domain/status";
import { SAMPLE_LEADS, SAMPLE_NOW, VIEWER_ZONES } from "@/lib/sample/data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Design system" };

const SECTIONS = [
  ["depths", "Depths"],
  ["tokens", "Tokens"],
  ["shape", "Shape and shadow"],
  ["type", "Type"],
  ["buttons", "Buttons"],
  ["inputs", "Inputs"],
  ["chips", "Chips"],
  ["controls", "Segmented control and key caps"],
  ["modules", "Tiles and cards"],
  ["activity", "Timeline and messages"],
  ["time", "Time and bars"],
  ["table", "Table"],
  ["states", "States"],
  ["overlays", "Overlays"],
] as const;

type Swatch = { token: string; value: string; note?: string };

const BRAND: Swatch[] = [
  { token: "--navy", value: "#0C1E2E", note: "primary, ink" },
  { token: "--navy-hover", value: "#13293D" },
  { token: "--peach", value: "#E9AF88", note: "selection" },
  { token: "--peach-deep", value: "#A9602F", note: "on white only" },
  { token: "--offwhite", value: "#F3EFE9", note: "on navy" },
];

const SURFACES: Swatch[] = [
  { token: "--canvas", value: "#F1EDE6" },
  { token: "--surface", value: "#FFFFFF" },
  { token: "--surface-tonal", value: "navy 6%" },
  { token: "--selected", value: "#FBF1E7" },
  { token: "--bubble-client", value: "#F8E8D8" },
  { token: "--bubble-fynix", value: "navy 5%" },
];

const NAVY_STEPS: Swatch[] = [
  { token: "--navy-03", value: "3%", note: "row hover" },
  { token: "--navy-04", value: "4%", note: "tiles, tray" },
  { token: "--navy-05", value: "5%", note: "inputs" },
  { token: "--navy-06", value: "6%", note: "ring" },
  { token: "--navy-07", value: "7%", note: "secondary" },
  { token: "--navy-08", value: "8%", note: "pressed" },
  { token: "--navy-10", value: "10%", note: "hover" },
];

const ON_NAVY: Swatch[] = [
  { token: "--on-navy-05", value: "white 5%" },
  { token: "--on-navy-07", value: "white 7%" },
  { token: "--on-navy-10", value: "white 10%" },
  { token: "--on-navy-16", value: "white 16%", note: "key cap, tick" },
  { token: "--on-navy-text", value: "offwhite 68%" },
  { token: "--on-navy-muted", value: "offwhite 60%" },
];

const TEXT: Swatch[] = [
  { token: "--ink", value: "#0C1E2E", note: "16.9 on white" },
  { token: "--ink-2", value: "#3F4D59", note: "8.7 on white" },
  { token: "--ink-muted", value: "#56626D", note: "6.2 on white" },
];

const STATUS = [
  { name: "Amber, pending review", key: "amber", text: "#7A4700", soft: "#FBEFD3", solid: "#D9961A", contrast: "6.7" },
  { name: "Green, approved", key: "green", text: "#176B3D", soft: "#E0F1E7", solid: "#2E9A5F", contrast: "5.6" },
  { name: "Red, rejected and overdue", key: "red", text: "#A3251D", soft: "#FBE6E2", solid: "#D4483D", contrast: "6.2" },
  { name: "Blue, needs clarification", key: "blue", text: "#1D4E8F", soft: "#E1ECF9", solid: "#3B7BD0", contrast: "6.9" },
] as const;

const RADII = [
  ["rounded-xs", "7px", "key caps"],
  ["rounded-sm", "12px", "rows, inputs, wells"],
  ["rounded-md", "16px", "tiles, lifted card"],
  ["rounded-lg", "22px", "panels, panes"],
  ["rounded-xl", "24px", "rail, dialogs"],
  ["rounded-full", "pill", "controls, chips"],
] as const;

const SHADOWS = [
  ["shadow-raised", "Panels and tiles"],
  ["shadow-selected", "Lifted card"],
  ["shadow-tile-lift", "Tile on a pane"],
  ["shadow-popover", "Overlays"],
  ["shadow-tray", "Action tray"],
  ["shadow-btn-primary", "Primary button"],
] as const;

const TYPE_SCALE = [
  ["text-caption", "12 / 16", "Key caps, captions, column heads", "text-caption"],
  ["text-label", "12.5 / 17", "Field labels, chip text", "text-label"],
  ["text-table", "13 / 17", "Table cells, row meta", "text-table"],
  ["text-body", "14 / 20", "Body, buttons, inputs", "text-body"],
  ["text-row", "14.5 / 20", "Names in lists", "text-row font-medium"],
  ["text-value", "15 / 20", "Panel titles, tile values", "text-value font-semibold"],
  ["text-lead", "16 / 24", "Role under a name", "text-lead"],
  ["text-title", "28 / 34", "Review queue", "text-title font-semibold tracking-title"],
  ["text-name", "34 / 38", "Tom Whitcombe", "text-name font-semibold tracking-title"],
  ["text-figure", "38 / 40", "1,284", "text-figure font-semibold tracking-figure"],
] as const;

const BUTTON_VARIANTS = [
  { variant: "default", title: "Primary", hover: "bg-navy-hover!", withKey: "A" },
  { variant: "secondary", title: "Secondary", hover: "bg-navy-10!", withKey: "C" },
  { variant: "destructive", title: "Destructive", hover: "bg-red-soft-hover!", withKey: "R" },
  { variant: "ghost", title: "Ghost", hover: "bg-navy-07!", withKey: "J" },
] as const;

const FOCUS_BUTTON = "outline-solid outline-2 outline-offset-3 outline-ring";
const FOCUS_FIELD = "ring-2 ring-ring";

/** A fixed moment relative to the sample clock, so the page never drifts. */
const atUtc = (daysFromNow: number, hour: number, minute: number): Date =>
  new Date(
    Date.UTC(
      SAMPLE_NOW.getUTCFullYear(),
      SAMPLE_NOW.getUTCMonth(),
      SAMPLE_NOW.getUTCDate() + daysFromNow,
      hour,
      minute,
    ),
  );
const before = (ms: number): Date => new Date(SAMPLE_NOW.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const TABLE_REFS = ["LD-3M7A", "LD-2W9H", "LD-7C3E", "LD-3H8Q", "LD-4K9P"];
const TABLE_LEADS = TABLE_REFS.map((ref) => SAMPLE_LEADS.find((lead) => lead.ref === ref)).filter(
  (lead): lead is (typeof SAMPLE_LEADS)[number] => lead !== undefined,
);
const TABLE_COLUMNS = ["Reference", "Prospect", "Company", "Approval", "Meeting", "Waiting"] as const;

const LIST_LEADS = TABLE_LEADS.slice(0, 3);
const RECORD_LEAD = SAMPLE_LEADS.find((lead) => lead.ref === "LD-4K9P") ?? SAMPLE_LEADS[0];
const BUBBLES = RECORD_LEAD.thread.slice(0, 3);

const TIMELINE_EVENTS = [
  { time: "08:20", icon: <PaperPlaneTilt aria-hidden size={15} />, text: "Replied to the follow-up question", by: "Meera, Fynix", fynix: true },
  { time: "13:30", icon: <ChatCircle aria-hidden size={15} />, text: "Asked a follow-up question", by: "Client", fynix: false },
];

const REASON_ITEMS = REJECTION_REASONS.map((reason) => ({ value: reason.code, label: reason.label }));

function Swatches({ items, onNavy = false, columns }: { items: Swatch[]; onNavy?: boolean; columns: string }) {
  return (
    <div className={cn("grid gap-x-3 gap-y-4", columns)}>
      {items.map(({ token, value, note }) => (
        <div key={token} className="flex min-w-0 flex-col gap-2">
          <span className={cn("block h-11 rounded-sm", onNavy && "bg-navy")}>
            <span
              className={cn("block size-full rounded-sm", !onNavy && "shadow-[inset_0_0_0_1px_var(--line)]")}
              style={{ backgroundColor: `var(${token})` }}
            />
          </span>
          <div className="min-w-0">
            <p className="truncate font-mono text-xs">{token}</p>
            <p className={cn("text-xs", onNavy ? "text-on-navy-text" : "text-ink-muted")}>
              {value}
              {note ? `, ${note}` : ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReasonSelect(props: {
  id: string;
  className?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  defaultValue?: string;
}) {
  const { id, className, disabled, invalid, describedBy, defaultValue } = props;
  return (
    <Select items={REASON_ITEMS} defaultValue={defaultValue ?? null} disabled={disabled}>
      <SelectTrigger id={id} aria-invalid={invalid} aria-describedby={describedBy} className={cn("w-full", className)}>
        <SelectValue placeholder="Choose a reason" />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {REASON_ITEMS.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LeadTable({ children }: { children: React.ReactNode }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {TABLE_COLUMNS.map((column) => (
            <TableHead key={column} scope="col">
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  );
}

/** A tile: icon disc, title and a definition list. Navy 4% on a white panel, white with a lift on a tonal pane. */
function Tile({ title, icon, rows }: { title: string; icon: React.ReactNode; rows: [string, React.ReactNode][] }) {
  return (
    <div className="rounded-md bg-navy-04 px-5 py-[18px]">
      <div className="mb-3 flex items-center gap-[9px]">
        <span className="grid size-[30px] place-items-center rounded-full bg-surface text-ink-2 shadow-disc">
          {icon}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <dl className="grid grid-cols-[72px_1fr] items-baseline gap-x-3 gap-y-2.5">
        {rows.map(([term, detail]) => (
          <div key={term} className="contents">
            <dt className="text-label font-medium text-ink-muted">{term}</dt>
            <dd className="text-sm font-medium">{detail}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 md:px-6">
      <header className="flex flex-col gap-3 py-6 md:py-8">
        <Link
          href="/"
          className="inline-flex h-8 w-fit items-center gap-2 rounded-full bg-navy-05 pr-3.5 pl-2.5 max-md:h-10 text-[13px] font-medium text-ink-2 transition-colors hover:bg-navy-07"
        >
          <ArrowLeft aria-hidden size={16} />
          Back to index
        </Link>
        <h1 className="text-title font-semibold tracking-title">Design system</h1>
        <p className="max-w-prose text-sm text-ink-2">
          Every token and component as it ships, in the states a screen can reach. Source of truth: DESIGN.md.
        </p>
        <nav aria-label="Sections" className="mt-1">
          <ul className="flex flex-wrap gap-2">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="inline-flex h-8 items-center rounded-full bg-navy-05 px-3.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-navy-07 max-md:h-10"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="flex flex-col gap-4">
        <Section
          id="depths"
          title="Depths"
          note="Four depths and nothing else. Zones come from tint and elevation, with no outlines. A fifth level is a bug."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Specimen fill caption="Canvas: the page, titles, the space around the rail">
              <div className="flex h-44 w-full flex-col justify-end rounded-lg bg-canvas p-5">
                <p className="text-sm font-semibold">Review queue</p>
                <p className="text-[13px] text-ink-2">6 leads waiting on your decision</p>
              </div>
            </Specimen>
            <Specimen fill caption="Tonal pane: a list or a column of tiles">
              <div className="flex h-44 w-full flex-col justify-end gap-2 rounded-lg bg-tonal p-3">
                <div className="rounded-md bg-surface px-4 py-3 shadow-selected">
                  <p className="text-sm font-semibold">Tom Whitcombe</p>
                  <p className="text-xs text-ink-muted">Selected row, lifted</p>
                </div>
                <div className="px-4 py-1">
                  <p className="text-sm font-medium">Priyanka Venkataraman</p>
                </div>
              </div>
            </Specimen>
            <Specimen fill caption="White panel: a module with data">
              <div className="flex h-44 w-full flex-col justify-end rounded-lg bg-surface p-4 shadow-raised">
                <div className="rounded-md bg-navy-04 px-4 py-3">
                  <p className="text-sm font-semibold">Meeting</p>
                  <p className="text-xs text-ink-muted">A tile on a panel</p>
                </div>
              </div>
            </Specimen>
            <Specimen fill caption="Navy hero: one per screen">
              <div className="flex h-44 w-full flex-col justify-end rounded-lg bg-navy p-5 text-offwhite shadow-hero">
                <p className="font-serif text-[56px] leading-[56px]">3</p>
                <p className="text-[13px] text-on-navy-text">of 72 delivered</p>
              </div>
            </Specimen>
          </div>
        </Section>

        <Section
          id="tokens"
          title="Tokens"
          note="CSS variables in app/globals.css, ported from the approved d-hybrid tokens. Pale values carry an inset hairline here so they stay visible."
        >
          <div className="flex flex-col gap-8">
            <Group title="Brand" className="block">
              <Swatches items={BRAND} columns="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" />
            </Group>
            <Group title="Canvas and surfaces" className="block">
              <Swatches items={SURFACES} columns="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" />
            </Group>
            <Group title="Navy alpha steps" className="block">
              <Swatches items={NAVY_STEPS} columns="grid-cols-2 sm:grid-cols-4 lg:grid-cols-7" />
            </Group>
            <Group title="On navy" className="block">
              <div className="rounded-md bg-navy p-4 text-offwhite">
                <Swatches items={ON_NAVY} onNavy columns="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" />
              </div>
            </Group>
            <Group title="Text" className="block">
              <Swatches items={TEXT} columns="grid-cols-2 sm:grid-cols-3" />
            </Group>
            <Group title="Status: text, soft fill and solid" className="block">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {STATUS.map((status) => (
                  <div key={status.key} className="flex flex-col gap-2">
                    <div className="grid h-11 grid-cols-3 overflow-hidden rounded-sm shadow-[inset_0_0_0_1px_var(--line)]">
                      <span style={{ backgroundColor: `var(--${status.key}-text)` }} />
                      <span style={{ backgroundColor: `var(--${status.key}-soft)` }} />
                      <span style={{ backgroundColor: `var(--${status.key}-solid)` }} />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium">{status.name}</p>
                      <p className="font-mono text-xs text-ink-muted">
                        {status.text} {status.soft} {status.solid}
                      </p>
                      <p className="text-xs text-ink-muted">Text on soft {status.contrast}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Group>
          </div>
        </Section>

        <Section
          id="shape"
          title="Shape and shadow"
          note="Radii step 7, 12, 16, 22, 24 and pill. Shadows are layered and tinted navy, never pure black."
        >
          <div className="flex flex-col gap-8">
            <Group title="Radii" className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
              {RADII.map(([utility, size, use]) => (
                <Specimen fill key={utility} caption={`${utility}, ${size}. ${use}`}>
                  <div className={cn("h-16 w-full bg-navy-07", utility)} />
                </Specimen>
              ))}
            </Group>
            <div className="rounded-lg bg-canvas p-6">
              <Group title="Shadows on the canvas" className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
                {SHADOWS.map(([utility, use]) => (
                  <Specimen fill key={utility} caption={`${utility}. ${use}`}>
                    <div
                      className={cn("h-20 w-full rounded-md", utility === "shadow-btn-primary" ? "bg-navy" : "bg-surface", utility)}
                    />
                  </Specimen>
                ))}
              </Group>
            </div>
          </div>
        </Section>

        <Section
          id="type"
          title="Type"
          note="Geist for the interface, Geist Mono for references and key caps, Geist Serif for the hero figure only. Sentence case everywhere."
        >
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <dl className="flex flex-col rounded-md bg-navy-04 px-5 py-2">
              {TYPE_SCALE.map(([name, size, sample, classes], index) => (
                <div
                  key={name}
                  className={cn(
                    "grid gap-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-baseline sm:gap-4",
                    index > 0 && "shadow-[inset_0_1px_0_var(--line)]",
                  )}
                >
                  <dt className="text-xs text-ink-muted">
                    <span className="font-mono">{name}</span>, {size}
                  </dt>
                  <dd>
                    <p className={classes}>{sample}</p>
                  </dd>
                </div>
              ))}
              <div className="grid gap-1 py-3 shadow-[inset_0_1px_0_var(--line)] sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-baseline sm:gap-4">
                <dt className="text-xs text-ink-muted">
                  <span className="font-mono">font-mono</span>, 12
                </dt>
                <dd className="font-mono text-xs font-medium">LD-4K9P</dd>
              </div>
            </dl>
            <div className="flex flex-col gap-4">
              <div className="rounded-lg bg-navy p-6 text-offwhite shadow-hero">
                <p className="mb-2 text-label text-on-navy-text">Hero figure, Geist Serif 96</p>
                <p className="flex items-baseline gap-3">
                  <span className="font-serif text-hero tracking-figure">3</span>
                  <span className="font-serif text-[42px] leading-12 text-offwhite/66">of 72</span>
                </p>
                <p className="text-[19px] leading-6 font-medium text-peach">delivered</p>
              </div>
              <div className="rounded-md bg-navy-04 p-4">
                <p className="mb-2 text-xs text-ink-muted">Tabular numerals are on, so digits stack in columns.</p>
                <ul className="flex flex-col gap-1 text-right text-sm font-medium">
                  {["1,111", "8,888", "117", "12"].map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Section>

        <Section
          id="buttons"
          title="Buttons"
          note="Pills with no outlines. Hover and focus are applied statically so each state can be read side by side."
        >
          <div className="flex flex-col gap-8">
            {BUTTON_VARIANTS.map(({ variant, title, hover, withKey }) => (
              <Group key={variant} title={title}>
                <Specimen caption="Rest">
                  <Button variant={variant}>Approve</Button>
                </Specimen>
                <Specimen caption="With key cap">
                  <Button variant={variant}>
                    Approve <Kbd>{withKey}</Kbd>
                  </Button>
                </Specimen>
                <Specimen caption="Hover">
                  <Button variant={variant} className={hover}>
                    Approve
                  </Button>
                </Specimen>
                <Specimen caption="Focus">
                  <Button variant={variant} className={FOCUS_BUTTON}>
                    Approve
                  </Button>
                </Specimen>
                <Specimen caption="Disabled">
                  <Button variant={variant} disabled>
                    Approve
                  </Button>
                </Specimen>
                <Specimen caption="Loading">
                  <Button variant={variant} aria-busy="true" className="pointer-events-none">
                    <SpinnerGap aria-hidden className="animate-spin" />
                    Approving
                  </Button>
                </Specimen>
              </Group>
            ))}
            <Group title="Sizes">
              <Specimen caption="Default, 44px">
                <Button>Approve</Button>
              </Specimen>
              <Specimen caption="Small, 32px">
                <Button size="sm" variant="secondary">
                  Export
                </Button>
              </Specimen>
              <Specimen caption="Extra small, 28px">
                <Button size="xs" variant="secondary">
                  Undo
                </Button>
              </Specimen>
              <Specimen caption="Icon, 40px">
                <Button size="icon" variant="secondary" aria-label="Refresh">
                  <ArrowClockwise aria-hidden />
                </Button>
              </Specimen>
              <Specimen caption="Icon small, 32px">
                <Button size="icon-sm" variant="ghost" aria-label="Refresh">
                  <ArrowClockwise aria-hidden />
                </Button>
              </Specimen>
            </Group>
          </div>
        </Section>

        <Section
          id="inputs"
          title="Inputs"
          note="Filled navy 5%, radius 12, 44px, no outline. Focus shows a 2px navy ring only. The label sits above, helper text below, and an error replaces it with an icon."
        >
          <div className="flex flex-col gap-8">
            <Group title="Text" className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
              <Specimen fill caption="Default">
                <Field id="text-default" label="Company website" helper="Domain only, for example brindlemarsh.co.uk.">
                  <Input id="text-default" aria-describedby="text-default-message" defaultValue="brindlemarsh.co.uk" />
                </Field>
              </Specimen>
              <Specimen fill caption="Focus">
                <Field id="text-focus" label="Company website" helper="Domain only, for example brindlemarsh.co.uk.">
                  <Input
                    id="text-focus"
                    aria-describedby="text-focus-message"
                    defaultValue="brindlemarsh.co.uk"
                    className={FOCUS_FIELD}
                  />
                </Field>
              </Specimen>
              <Specimen fill caption="Disabled">
                <Field id="text-disabled" label="Company website" helper="Set when the lead is submitted.">
                  <Input
                    id="text-disabled"
                    aria-describedby="text-disabled-message"
                    defaultValue="brindlemarsh.co.uk"
                    disabled
                  />
                </Field>
              </Specimen>
              <Specimen fill caption="Error">
                <Field
                  id="text-error"
                  label="Company website"
                  error="Enter a domain without spaces, such as brindlemarsh.co.uk."
                >
                  <Input id="text-error" aria-invalid aria-describedby="text-error-message" defaultValue="brindle marsh" />
                </Field>
              </Specimen>
            </Group>

            <Group title="Select" className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
              <Specimen fill caption="Default">
                <Field id="select-default" label="Reason for rejection" helper="The agency sees the reason, not your name.">
                  <ReasonSelect id="select-default" describedBy="select-default-message" defaultValue="no_budget" />
                </Field>
              </Specimen>
              <Specimen fill caption="Focus">
                <Field id="select-focus" label="Reason for rejection" helper="The agency sees the reason, not your name.">
                  <ReasonSelect
                    id="select-focus"
                    describedBy="select-focus-message"
                    defaultValue="no_budget"
                    className={FOCUS_FIELD}
                  />
                </Field>
              </Specimen>
              <Specimen fill caption="Disabled">
                <Field id="select-disabled" label="Reason for rejection" helper="Available once you choose Reject.">
                  <ReasonSelect id="select-disabled" describedBy="select-disabled-message" disabled />
                </Field>
              </Specimen>
              <Specimen fill caption="Error">
                <Field id="select-error" label="Reason for rejection" error="Choose a reason. A rejection needs one.">
                  <ReasonSelect id="select-error" describedBy="select-error-message" invalid />
                </Field>
              </Specimen>
            </Group>

            <Group title="Textarea" className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
              <Specimen fill caption="Default">
                <Field id="area-default" label="Note to the agency" helper="Do not include contact details.">
                  <Textarea
                    id="area-default"
                    aria-describedby="area-default-message"
                    defaultValue="Please confirm the Q1 budget owner."
                  />
                </Field>
              </Specimen>
              <Specimen fill caption="Focus">
                <Field id="area-focus" label="Note to the agency" helper="Do not include contact details.">
                  <Textarea
                    id="area-focus"
                    aria-describedby="area-focus-message"
                    defaultValue="Please confirm the Q1 budget owner."
                    className={FOCUS_FIELD}
                  />
                </Field>
              </Specimen>
              <Specimen fill caption="Disabled">
                <Field id="area-disabled" label="Note to the agency" helper="Locked after a decision.">
                  <Textarea
                    id="area-disabled"
                    aria-describedby="area-disabled-message"
                    defaultValue="Approved, thank you."
                    disabled
                  />
                </Field>
              </Specimen>
              <Specimen fill caption="Error">
                <Field id="area-error" label="Note to the agency" error="Say what needs clarifying before you send.">
                  <Textarea id="area-error" aria-invalid aria-describedby="area-error-message" />
                </Field>
              </Specimen>
            </Group>
          </div>
        </Section>

        <Section
          id="chips"
          title="Chips"
          note="Soft tinted pills with an icon and a label, never an outline. 26px in headers, 22px in tables. Meeting status is quiet icon plus text."
        >
          <div className="flex flex-col gap-8">
            <Group title="Approval, 26px">
              {APPROVAL_STATUSES.map((status) => (
                <StatusBadge key={status} kind="approval" status={status} size="md" />
              ))}
            </Group>
            <Group title="Approval, 22px for tables">
              {APPROVAL_STATUSES.map((status) => (
                <StatusBadge key={status} kind="approval" status={status} size="sm" />
              ))}
            </Group>
            <Group title="Meeting" className="gap-x-5">
              {MEETING_STATUSES.map((status) => (
                <StatusBadge key={status} kind="meeting" status={status} />
              ))}
            </Group>
            <Group title="In greyscale" className="block">
              <p className="mb-3 max-w-prose text-xs text-ink-muted">
                The same chips with colour removed. Every status still reads from its icon and its label.
              </p>
              <div className="flex flex-col gap-4 rounded-md bg-navy-04 p-4 [filter:grayscale(1)]">
                <div className="flex flex-wrap gap-3">
                  {APPROVAL_STATUSES.map((status) => (
                    <StatusBadge key={status} kind="approval" status={status} size="md" />
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  {APPROVAL_STATUSES.map((status) => (
                    <StatusBadge key={status} kind="approval" status={status} size="sm" />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {MEETING_STATUSES.map((status) => (
                    <StatusBadge key={status} kind="meeting" status={status} />
                  ))}
                </div>
              </div>
            </Group>
          </div>
        </Section>

        <Section
          id="controls"
          title="Segmented control and key caps"
          note="The track is navy 5%. The active segment is navy with offwhite text and a peach count."
        >
          <div className="flex flex-col gap-8">
            <Group title="Segmented control">
              <Specimen caption="Filter with counts">
                <Tabs defaultValue="waiting">
                  <TabsList>
                    <TabsTrigger value="waiting">
                      Waiting <b>6</b>
                    </TabsTrigger>
                    <TabsTrigger value="clarifying">
                      Clarifying <b>2</b>
                    </TabsTrigger>
                    <TabsTrigger value="decided">
                      Decided <b>6</b>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </Specimen>
              <Specimen caption="Without counts">
                <Tabs defaultValue="details">
                  <TabsList>
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="activity">Activity</TabsTrigger>
                    <TabsTrigger value="messages">Messages</TabsTrigger>
                  </TabsList>
                </Tabs>
              </Specimen>
            </Group>
            <Group title="Key caps">
              <Specimen caption="Single keys">
                <span className="flex gap-1.5">
                  <Kbd>A</Kbd>
                  <Kbd>R</Kbd>
                  <Kbd>C</Kbd>
                  <Kbd>J</Kbd>
                  <Kbd>K</Kbd>
                </span>
              </Specimen>
              <Specimen caption="Combination">
                <Kbd>Ctrl K</Kbd>
              </Specimen>
              <Specimen caption="In a hint">
                <p className="text-label text-ink-2">
                  <Kbd>J</Kbd> and <Kbd>K</Kbd> move between leads
                </p>
              </Specimen>
            </Group>
          </div>
        </Section>

        <Section
          id="modules"
          title="Tiles and cards"
          note="A tile on a white panel is navy 4%. A lifted card sits on a tonal pane. The hero tile is navy, one per screen."
        >
          <div className="flex flex-col gap-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Specimen fill caption="Tiles on a white panel">
                <div className="grid w-full gap-3 sm:grid-cols-2">
                  <Tile
                    title="Meeting"
                    icon={<CalendarBlank aria-hidden size={17} />}
                    rows={[
                      ["When", "Mon 16 Nov, 11:00 am"],
                      ["Status", <StatusBadge key="s" kind="meeting" status="scheduled" />],
                      ["Length", "45 minutes"],
                    ]}
                  />
                  <Tile
                    title="Contact"
                    icon={<IdentificationCard aria-hidden size={17} />}
                    rows={[
                      ["Phone", "+44 161 496 0254"],
                      ["Zone", "London, GMT"],
                    ]}
                  />
                </div>
              </Specimen>
              <Specimen fill caption="Tonal pane with a lifted selected card and flat rows">
                <div className="w-full rounded-lg bg-tonal p-2">
                  {LIST_LEADS.map((lead, index) => {
                    const selected = index === 0;
                    return (
                      <div
                        key={lead.ref}
                        className={cn(
                          "relative grid grid-cols-[1fr_auto] gap-x-3 rounded-md px-[18px] py-3.5",
                          selected
                            ? "z-10 bg-surface shadow-selected before:absolute before:inset-y-[18px] before:left-0 before:w-[3px] before:rounded-r-[3px] before:bg-peach"
                            : "hover:bg-navy-04",
                          index === 2 && "after:absolute after:inset-x-[18px] after:top-0 after:h-px after:bg-line",
                        )}
                      >
                        <div className="min-w-0">
                          <p className={cn("text-row", selected ? "font-semibold" : "font-medium")}>{lead.prospect.name}</p>
                          <p className="truncate text-table font-medium text-ink-2">{lead.prospect.company}</p>
                          <p className="truncate text-table text-ink-muted">{lead.prospect.title}</p>
                        </div>
                        <div className="text-right">
                          <WaitingAge since={new Date(lead.submittedAt)} now={SAMPLE_NOW} />
                          <p className="font-mono text-[11.5px] text-ink-muted">{lead.ref}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Specimen>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <Specimen fill caption="Hero tile with the serif figure and a bar with a target tick">
                <div className="relative flex w-full flex-col gap-6 overflow-hidden rounded-lg bg-navy p-6 text-offwhite shadow-hero">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -top-28 -right-20 size-[360px] rounded-full bg-(image:--hero-glow)"
                  />
                  <div className="relative flex items-center justify-between gap-3">
                    <b className="text-sm font-semibold">Progress toward target</b>
                    <span className="inline-flex h-[26px] items-center rounded-full bg-on-navy-07 px-3 text-label text-on-navy-text">
                      Approved with a completed meeting
                    </span>
                  </div>
                  <p className="relative flex flex-wrap items-baseline gap-x-3.5">
                    <span className="font-serif text-hero tracking-figure">3</span>
                    <span className="font-serif text-[42px] leading-12 text-offwhite/66">of 72</span>
                    <span className="text-[19px] font-medium text-peach">delivered</span>
                  </p>
                  <div className="relative">
                    <BulletGraph tone="hero" label="12 a month for 6 months" delivered={3} target={72} comparison="of 72 target" />
                  </div>
                </div>
              </Specimen>
              <Specimen fill caption="Panel with figures, no icon tile on every metric">
                <div className="w-full rounded-lg bg-surface p-5 shadow-raised">
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-semibold">This month</h3>
                    <span className="text-[13px] text-ink-muted">November 2026, 9 still to deliver</span>
                  </div>
                  <p className="flex items-baseline gap-2 text-figure font-semibold tracking-figure">
                    3 <small className="text-sm font-medium tracking-normal text-ink-muted">of 12 delivered</small>
                  </p>
                  <div className="mt-4 grid grid-cols-12 gap-[5px]">
                    {Array.from({ length: 12 }, (_, i) => (
                      <i key={i} className={cn("h-2.5 rounded-full", i < 3 ? "bg-navy" : "bg-navy-07")} />
                    ))}
                  </div>
                </div>
              </Specimen>
            </div>
          </div>
        </Section>

        <Section
          id="activity"
          title="Timeline and messages"
          note="Timeline rows are 40px: time, icon disc, text, actor. Bubbles carry one tight corner each."
        >
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="flex flex-col gap-1">
              <h3 className="mb-2 text-sm font-semibold text-ink-2">Timeline</h3>
              <div className="grid grid-cols-[96px_1fr]">
                <div className="pt-2.5 text-[13px] leading-5 font-semibold text-ink-2">
                  Today
                  <small className="block text-xs leading-4 font-normal text-ink-muted">Wed 11 Nov</small>
                </div>
                <div className="flex flex-col">
                  {TIMELINE_EVENTS.map((event) => (
                    <div
                      key={event.time}
                      className="relative grid h-10 grid-cols-[48px_28px_1fr_auto] items-center gap-x-3.5 text-sm before:absolute before:inset-y-0 before:left-[calc(48px+14px+13.5px)] before:w-px before:bg-line first:before:top-1/2"
                    >
                      <span className="text-right text-label text-ink-muted">{event.time}</span>
                      <span
                        className={cn(
                          "relative z-10 grid size-7 place-items-center rounded-full",
                          event.fynix ? "bg-peach/32 text-peach-deep" : "bg-navy-07 text-ink-2",
                        )}
                      >
                        {event.icon}
                      </span>
                      <span className="font-medium">{event.text}</span>
                      <span className="text-[13px] text-ink-muted">{event.by}</span>
                    </div>
                  ))}
                  <div className="grid h-10 grid-cols-[48px_28px_1fr] items-center gap-x-3.5 text-sm">
                    <span className="text-right text-label text-ink-muted">10:03</span>
                    <span />
                    <span className="inline-flex h-[26px] w-fit items-center rounded-full bg-navy-05 px-3 text-label font-medium text-ink-2">
                      3 system updates
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-ink-2">Message bubbles</h3>
              {BUBBLES.map((message) => {
                const client = message.side === "client";
                return (
                  <div
                    key={message.id}
                    className={cn("flex max-w-[84%] flex-col", client ? "items-end self-end" : "items-start self-start")}
                  >
                    <p className="mb-1.5 text-label font-semibold text-ink-2">{message.author}</p>
                    <p
                      className={cn(
                        "px-4 py-3 text-sm leading-[21px]",
                        client ? "rounded-[18px_6px_18px_18px] bg-bubble-client" : "rounded-[6px_18px_18px_18px] bg-bubble-fynix",
                      )}
                    >
                      {message.body}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </Section>

        <Section
          id="time"
          title="Time and bars"
          note="The viewer's time comes first, the other side's time sits under it, and an amber warning shows outside 8 am to 7 pm for either side. Waiting past 24 hours turns red. All values come from the sample clock."
        >
          <div className="flex flex-col gap-7">
            <Group title="Meeting time" className="gap-x-12">
              <Specimen caption="Viewer in London, other side in Kolkata">
                <TimeInZones
                  at={atUtc(1, 9, 30)}
                  viewerZone={VIEWER_ZONES.client}
                  other={{ zone: VIEWER_ZONES.agency, label: "Kolkata" }}
                />
              </Specimen>
              <Specimen caption="Off hours: 7:30 am in New York">
                <TimeInZones
                  at={atUtc(1, 12, 30)}
                  viewerZone={VIEWER_ZONES.client}
                  other={{ zone: "America/New_York", label: "New York" }}
                />
              </Specimen>
            </Group>
            <Group title="Waiting age" className="gap-x-10">
              <Specimen caption="12 minutes">
                <WaitingAge since={before(12 * MIN)} now={SAMPLE_NOW} />
              </Specimen>
              <Specimen caption="5 hours">
                <WaitingAge since={before(5 * HOUR)} now={SAMPLE_NOW} />
              </Specimen>
              <Specimen caption="2 days 4 hours, overdue">
                <WaitingAge since={before(2 * DAY + 4 * HOUR)} now={SAMPLE_NOW} />
              </Specimen>
              <Specimen caption="9 days, overdue">
                <WaitingAge since={before(9 * DAY)} now={SAMPLE_NOW} />
              </Specimen>
            </Group>
            <Group title="Bar with a target tick" className="block">
              <div className="flex max-w-xl flex-col gap-5">
                <BulletGraph label="Under target" delivered={7} target={12} comparison="of 12 this month" />
                <BulletGraph label="On target" delivered={12} target={12} comparison="of 12 this month" />
                <BulletGraph label="Over target" delivered={15} target={12} comparison="of 12 this month" />
              </div>
            </Group>
          </div>
        </Section>

        <Section
          id="table"
          title="Table"
          note="Tinted head band, 50px rows, 13px text and inset dividers between rows only. The current row is peach tinted. Static here; the sortable table comes with the agency screen."
        >
          <LeadTable>
            {TABLE_LEADS.map((lead, index) => {
              const decided = lead.approval === "approved" || lead.approval === "rejected";
              const meeting = lead.meetings[0];
              return (
                <TableRow key={lead.ref} data-state={index === 0 ? "selected" : undefined}>
                  <TableCell className="font-mono text-xs text-ink-muted">{lead.ref}</TableCell>
                  <TableCell className="font-semibold">{lead.prospect.name}</TableCell>
                  <TableCell>{lead.prospect.company}</TableCell>
                  <TableCell>
                    <StatusBadge kind="approval" status={lead.approval} size="sm" />
                  </TableCell>
                  <TableCell>
                    {meeting ? (
                      <StatusBadge kind="meeting" status={meeting.status} />
                    ) : (
                      <span role="img" aria-label="No meeting" className="inline-block h-0.5 w-2.5 rounded-xs bg-navy-10 align-middle" />
                    )}
                  </TableCell>
                  <TableCell>
                    {decided ? (
                      <span className="text-ink-muted">Decided</span>
                    ) : (
                      <WaitingAge since={new Date(lead.submittedAt)} now={SAMPLE_NOW} />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </LeadTable>
        </Section>

        <Section
          id="states"
          title="States"
          note="Every screen needs an empty, a loading and an error state. Each skeleton keeps the layout of the screen it stands in for: the leads table and the review queue."
        >
          <div className="flex flex-col gap-7">
            <Group title="Empty" className="block">
              <div className="flex flex-col items-center gap-3 rounded-md bg-navy-04 px-6 py-10 text-center">
                <div className="flex max-w-sm flex-col gap-1">
                  <p className="text-sm font-semibold">No leads match these filters</p>
                  <p className="text-sm text-ink-2">Widen the date range or clear a filter to see more leads.</p>
                </div>
                <Button variant="secondary">Clear filters</Button>
              </div>
            </Group>
            <Group title="Loading" className="block">
              <div role="status" className="flex flex-col gap-6">
                <span className="sr-only">Loading leads</span>
                <div className="rounded-lg bg-canvas p-4">
                  <LeadsTableSkeleton />
                </div>
                <div className="rounded-lg bg-canvas p-4">
                  <ReviewQueueSkeleton className="lg:h-[460px] lg:min-h-0" />
                </div>
              </div>
            </Group>
            <Group title="Error" className="block">
              <div
                role="alert"
                className="flex flex-col gap-3 rounded-md bg-red-soft p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="flex items-start gap-2 text-sm text-red-text">
                  <WarningCircle aria-hidden size={18} weight="fill" className="mt-0.5 shrink-0" />
                  The leads did not load because the connection dropped. Check your connection and try again.
                </p>
                <Button variant="secondary" size="sm" className="shrink-0 bg-surface hover:bg-surface">
                  <ArrowClockwise aria-hidden />
                  Try again
                </Button>
              </div>
            </Group>
          </div>
        </Section>

        <Section
          id="overlays"
          title="Overlays"
          note="Menus, popovers, dialogs, tooltips and toasts are white with no border and one shadow. Dialogs and sheets sit on a navy 30% scrim."
        >
          <OverlayDemos />
        </Section>
      </main>
    </div>
  );
}
