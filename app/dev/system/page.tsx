import { ArrowClockwise, ArrowLeft, SpinnerGap, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { BulletGraph } from "@/components/charts/bullet-graph";
import { OverlayDemos } from "@/components/dev/overlay-demos";
import { Field } from "@/components/dev/field";
import { Group, Section, Specimen } from "@/components/dev/specimen";
import { StatusBadge } from "@/components/status/status-badge";
import { TimeInZones } from "@/components/time/time-in-zones";
import { WaitingAge } from "@/components/time/waiting-age";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { APPROVAL_STATUSES, MEETING_STATUSES } from "@/lib/domain/status";
import { REJECTION_REASONS } from "@/lib/domain/rejection-reasons";
import { SAMPLE_LEADS, SAMPLE_NOW, VIEWER_ZONES } from "@/lib/sample/data";

export const metadata: Metadata = { title: "Design system | Fynix Leads" };

const SECTIONS = [
  ["colour", "Colour"],
  ["type", "Type"],
  ["buttons", "Buttons"],
  ["inputs", "Inputs"],
  ["status", "Status"],
  ["time", "Time"],
  ["bullet", "Bullet graph"],
  ["table", "Table"],
  ["states", "States"],
  ["overlays", "Overlays"],
] as const;

const NEUTRALS = [
  ["--gray-1", "#fcfcfb"],
  ["--gray-2", "#f7f6f4"],
  ["--gray-3", "#f0efec"],
  ["--gray-4", "#e9e7e3"],
  ["--gray-5", "#e1dfda"],
  ["--gray-6", "#d6d3cd"],
  ["--gray-7", "#c5c1ba"],
  ["--gray-8", "#a9a49c"],
  ["--gray-9", "#8a857d"],
  ["--gray-10", "#6e6a63"],
  ["--gray-11", "#4f4b45"],
  ["--gray-12", "#1f1d1a"],
] as const;

const BRAND = [
  ["--navy", "#0c1e2e"],
  ["--navy-hover", "#172d40"],
  ["--peach", "#e9af88"],
  ["--peach-subtle", "#fbede3"],
] as const;

type ToneRow = {
  name: string;
  text: readonly [string, string];
  surface?: readonly [string, string];
  border?: readonly [string, string];
};

const TONES: ToneRow[] = [
  {
    name: "Pending",
    text: ["--tone-pending", "#8a5a12"],
    surface: ["--tone-pending-surface", "#fbf1de"],
    border: ["--tone-pending-border", "#eed9ae"],
  },
  {
    name: "Approved",
    text: ["--tone-approved", "#2d6a4a"],
    surface: ["--tone-approved-surface", "#e8f2ec"],
    border: ["--tone-approved-border", "#c6dfcf"],
  },
  {
    name: "Rejected",
    text: ["--tone-rejected", "#9b3530"],
    surface: ["--tone-rejected-surface", "#fbecea"],
    border: ["--tone-rejected-border", "#f0cbc7"],
  },
  {
    name: "Needs clarification",
    text: ["--tone-clarify", "#2f5679"],
    surface: ["--tone-clarify-surface", "#e9f0f6"],
    border: ["--tone-clarify-border", "#c8d8e7"],
  },
  { name: "Problem meeting outcomes", text: ["--tone-problem", "#9b3530"] },
];

function Swatch({ token, hex }: { token: string; hex: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="h-9 rounded-md border" style={{ backgroundColor: `var(${token})` }} />
      <div className="min-w-0">
        <p className="truncate font-mono text-xs">{token}</p>
        <p className="font-mono text-xs text-muted-foreground">{hex}</p>
      </div>
    </div>
  );
}

const BUTTON_VARIANTS = [
  { variant: "default", title: "Primary", hover: "bg-navy-hover!", focus: "border-ring ring-3 ring-ring/50" },
  {
    variant: "secondary",
    title: "Secondary",
    hover: "bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]!",
    focus: "border-ring ring-3 ring-ring/50",
  },
  {
    variant: "outline",
    title: "Outline",
    hover: "bg-accent! text-foreground!",
    focus: "border-ring ring-3 ring-ring/50",
  },
  { variant: "ghost", title: "Ghost", hover: "bg-accent! text-foreground!", focus: "border-ring ring-3 ring-ring/50" },
  {
    variant: "destructive",
    title: "Destructive",
    hover: "bg-destructive/20!",
    focus: "border-destructive/40 ring-3 ring-destructive/20",
  },
] as const;

const FOCUS = "border-ring ring-3 ring-ring/50";

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

const REASON_ITEMS = REJECTION_REASONS.map((reason) => ({ value: reason.code, label: reason.label }));

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
      <SelectTrigger
        id={id}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={`w-full ${className ?? ""}`}
      >
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
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow className="hover:bg-transparent">
            {TABLE_COLUMNS.map((column) => (
              <TableHead key={column} scope="col">
                {column}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 md:px-6">
      <header className="flex flex-col gap-3 py-6 md:py-8">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft aria-hidden size={16} />
          Back to index
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">Design system</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Every token and component as it ships, in the states a screen can reach. Source of truth: DESIGN.md.
        </p>
        <nav aria-label="Sections" className="mt-1">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="rounded-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="flex flex-col gap-12">
        <Section
          id="colour"
          title="Colour"
          note="One accent. Navy carries action and focus, peach marks selection only. Status tones pair a text colour with a surface and a border."
        >
          <div className="flex flex-col gap-8">
            <Group
              title="Warm neutral scale"
              className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-6 lg:grid-cols-12"
            >
              {NEUTRALS.map(([token, hex]) => (
                <Swatch key={token} token={token} hex={hex} />
              ))}
            </Group>
            <Group title="Fynix colours" className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
              {BRAND.map(([token, hex]) => (
                <Swatch key={token} token={token} hex={hex} />
              ))}
            </Group>
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">Status tones</h3>
              <div className="flex flex-col gap-4">
                {TONES.map((tone) => (
                  <div
                    key={tone.name}
                    className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-[10rem_repeat(3,minmax(0,1fr))]"
                  >
                    <p className="col-span-2 pt-0 text-xs text-muted-foreground sm:col-span-1 sm:pt-2">{tone.name}</p>
                    <Swatch token={tone.text[0]} hex={tone.text[1]} />
                    {tone.surface && <Swatch token={tone.surface[0]} hex={tone.surface[1]} />}
                    {tone.border && <Swatch token={tone.border[0]} hex={tone.border[1]} />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section
          id="type"
          title="Type"
          note="Geist for the interface, Geist Mono for references only. Sentence case everywhere."
        >
          <div className="grid gap-x-8 gap-y-8 md:grid-cols-[minmax(0,1fr)_16rem]">
            <dl className="flex flex-col divide-y rounded-lg border bg-card">
              {[
                [
                  "Heading, 20px semibold",
                  <p key="h1" className="text-xl font-semibold tracking-tight">
                    Review queue
                  </p>,
                ],
                [
                  "Heading, 16px semibold",
                  <p key="h2" className="text-base font-semibold">
                    Waiting for your decision
                  </p>,
                ],
                [
                  "Heading, 14px semibold",
                  <p key="h3" className="text-sm font-semibold">
                    Meeting details
                  </p>,
                ],
                [
                  "Body, 14px",
                  <p key="b" className="text-sm">
                    Approve a lead once the meeting looks real and the prospect fits the brief.
                  </p>,
                ],
                [
                  "Table, 13px",
                  <p key="t" className="text-table">
                    Harriet Oyelaran, Brindle & Marsh
                  </p>,
                ],
                [
                  "Meta, 12px",
                  <p key="m" className="text-xs text-muted-foreground">
                    Submitted 3 hours ago
                  </p>,
                ],
                [
                  "Reference, Geist Mono 13px",
                  <p key="r" className="font-mono text-table">
                    LD-4K9P
                  </p>,
                ],
              ].map(([label, sample]) => (
                <div
                  key={label as string}
                  className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-baseline sm:gap-4"
                >
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd>{sample}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">Numerals</h3>
              <p className="text-xs text-muted-foreground">
                Tabular figures are on everywhere, so digits stack in columns.
              </p>
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-card p-4">
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">Tabular</p>
                  <ul className="flex flex-col gap-1 text-right text-sm">
                    {["1,111", "8,888", "117", "12"].map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">Proportional</p>
                  <ul className="flex flex-col gap-1 text-right text-sm [font-variant-numeric:normal]">
                    {["1,111", "8,888", "117", "12"].map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section
          id="buttons"
          title="Buttons"
          note="Hover and focus are applied statically here so each state can be read side by side."
        >
          <div className="flex flex-col gap-7">
            {BUTTON_VARIANTS.map(({ variant, title, hover, focus }) => (
              <Group key={variant} title={title}>
                <Specimen caption="Rest">
                  <Button variant={variant}>Approve</Button>
                </Specimen>
                <Specimen caption="Hover">
                  <Button variant={variant} className={hover}>
                    Approve
                  </Button>
                </Specimen>
                <Specimen caption="Focus">
                  <Button variant={variant} className={focus}>
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
          </div>
        </Section>

        <Section
          id="inputs"
          title="Inputs"
          note="The label sits above the field. Helper text sits below, and error text replaces it with an icon."
        >
          <div className="flex flex-col gap-8">
            <Group title="Text" className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
              <Specimen caption="Default" className="w-full">
                <Field id="text-default" label="Company website" helper="Domain only, for example brindlemarsh.co.uk.">
                  <Input id="text-default" aria-describedby="text-default-message" defaultValue="brindlemarsh.co.uk" />
                </Field>
              </Specimen>
              <Specimen caption="Focus" className="w-full">
                <Field id="text-focus" label="Company website" helper="Domain only, for example brindlemarsh.co.uk.">
                  <Input
                    id="text-focus"
                    aria-describedby="text-focus-message"
                    defaultValue="brindlemarsh.co.uk"
                    className={FOCUS}
                  />
                </Field>
              </Specimen>
              <Specimen caption="Disabled" className="w-full">
                <Field id="text-disabled" label="Company website" helper="Set when the lead is submitted.">
                  <Input
                    id="text-disabled"
                    aria-describedby="text-disabled-message"
                    defaultValue="brindlemarsh.co.uk"
                    disabled
                  />
                </Field>
              </Specimen>
              <Specimen caption="Error" className="w-full">
                <Field
                  id="text-error"
                  label="Company website"
                  error="Enter a domain without spaces, such as brindlemarsh.co.uk."
                >
                  <Input
                    id="text-error"
                    aria-invalid
                    aria-describedby="text-error-message"
                    defaultValue="brindle marsh"
                  />
                </Field>
              </Specimen>
            </Group>

            <Group title="Select" className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
              <Specimen caption="Default" className="w-full">
                <Field
                  id="select-default"
                  label="Reason for rejection"
                  helper="The agency sees the reason, not your name."
                >
                  <ReasonSelect id="select-default" describedBy="select-default-message" defaultValue="no_budget" />
                </Field>
              </Specimen>
              <Specimen caption="Focus" className="w-full">
                <Field
                  id="select-focus"
                  label="Reason for rejection"
                  helper="The agency sees the reason, not your name."
                >
                  <ReasonSelect
                    id="select-focus"
                    describedBy="select-focus-message"
                    defaultValue="no_budget"
                    className={FOCUS}
                  />
                </Field>
              </Specimen>
              <Specimen caption="Disabled" className="w-full">
                <Field id="select-disabled" label="Reason for rejection" helper="Available once you choose Reject.">
                  <ReasonSelect id="select-disabled" describedBy="select-disabled-message" disabled />
                </Field>
              </Specimen>
              <Specimen caption="Error" className="w-full">
                <Field id="select-error" label="Reason for rejection" error="Choose a reason. A rejection needs one.">
                  <ReasonSelect id="select-error" describedBy="select-error-message" invalid />
                </Field>
              </Specimen>
            </Group>

            <Group title="Textarea" className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
              <Specimen caption="Default" className="w-full">
                <Field id="area-default" label="Note to the agency" helper="Do not include contact details.">
                  <Textarea
                    id="area-default"
                    aria-describedby="area-default-message"
                    defaultValue="Please confirm the Q1 budget owner."
                  />
                </Field>
              </Specimen>
              <Specimen caption="Focus" className="w-full">
                <Field id="area-focus" label="Note to the agency" helper="Do not include contact details.">
                  <Textarea
                    id="area-focus"
                    aria-describedby="area-focus-message"
                    defaultValue="Please confirm the Q1 budget owner."
                    className={FOCUS}
                  />
                </Field>
              </Specimen>
              <Specimen caption="Disabled" className="w-full">
                <Field id="area-disabled" label="Note to the agency" helper="Locked after a decision.">
                  <Textarea
                    id="area-disabled"
                    aria-describedby="area-disabled-message"
                    defaultValue="Approved, thank you."
                    disabled
                  />
                </Field>
              </Specimen>
              <Specimen caption="Error" className="w-full">
                <Field id="area-error" label="Note to the agency" error="Say what needs clarifying before you send.">
                  <Textarea id="area-error" aria-invalid aria-describedby="area-error-message" />
                </Field>
              </Specimen>
            </Group>
          </div>
        </Section>

        <Section
          id="status"
          title="Status"
          note="Approval chips carry colour, an icon and a label. Meeting status is neutral grey, and only problem outcomes take a tint."
        >
          <div className="flex flex-col gap-7">
            <Group title="Approval">
              {APPROVAL_STATUSES.map((status) => (
                <StatusBadge key={status} kind="approval" status={status} />
              ))}
            </Group>
            <Group title="Meeting" className="gap-x-5">
              {MEETING_STATUSES.map((status) => (
                <StatusBadge key={status} kind="meeting" status={status} />
              ))}
            </Group>
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">Together in a row</h3>
              <div className="grid items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-3 py-2 text-table sm:grid-cols-[5.5rem_minmax(0,1fr)_12rem_8rem]">
                <span className="font-mono">LD-3M7A</span>
                <span className="truncate">Harriet Oyelaran, Brindle & Marsh</span>
                <StatusBadge kind="approval" status="pending" className="w-fit" />
                <StatusBadge kind="meeting" status="scheduled" />
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">In greyscale</h3>
              <p className="max-w-prose text-xs text-muted-foreground">
                The same chips with colour removed. Every status still reads from its icon and its text.
              </p>
              <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 [filter:grayscale(1)]">
                <div className="flex flex-wrap gap-3">
                  {APPROVAL_STATUSES.map((status) => (
                    <StatusBadge key={status} kind="approval" status={status} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {MEETING_STATUSES.map((status) => (
                    <StatusBadge key={status} kind="meeting" status={status} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section
          id="time"
          title="Time"
          note="The viewer's time comes first, the other side's time sits under it, and a warning shows outside 8 am to 7 pm for either side. All values are computed from the sample clock."
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
          </div>
        </Section>

        <Section
          id="bullet"
          title="Bullet graph"
          note="Delivered against target, with the comparison written out. Navy is the delivered value, grey is the target band."
        >
          <div className="flex max-w-xl flex-col gap-5 rounded-lg border bg-card p-4">
            <BulletGraph label="Under target" delivered={7} target={12} comparison="of 12 this month" />
            <BulletGraph label="On target" delivered={12} target={12} comparison="of 12 this month" />
            <BulletGraph label="Over target" delivered={15} target={12} comparison="of 12 this month" />
          </div>
        </Section>

        <Section
          id="table"
          title="Table"
          note="Rows are 40px with 13px text and hairline dividers. This one is static; the sortable table comes with the agency screen."
        >
          <LeadTable>
            {TABLE_LEADS.map((lead) => {
              const decided = lead.approval === "approved" || lead.approval === "rejected";
              const meeting = lead.meetings[0];
              return (
                <TableRow key={lead.ref}>
                  <TableCell className="font-mono">{lead.ref}</TableCell>
                  <TableCell className="font-medium">{lead.prospect.name}</TableCell>
                  <TableCell className="text-muted-foreground">{lead.prospect.company}</TableCell>
                  <TableCell>
                    <StatusBadge kind="approval" status={lead.approval} />
                  </TableCell>
                  <TableCell>
                    {meeting ? (
                      <StatusBadge kind="meeting" status={meeting.status} />
                    ) : (
                      <span className="text-muted-foreground">No meeting</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {decided ? (
                      <span className="text-muted-foreground">Decided</span>
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
          note="Every screen needs an empty, a loading and an error state. The skeleton keeps the layout of the table it stands in for."
        >
          <div className="flex flex-col gap-7">
            <Group title="Empty" className="block">
              <div className="flex flex-col items-center gap-3 rounded-lg border bg-card px-6 py-10 text-center">
                <div className="flex max-w-sm flex-col gap-1">
                  <p className="text-sm font-medium">No leads match these filters</p>
                  <p className="text-sm text-muted-foreground">
                    Widen the date range or clear a filter to see more leads.
                  </p>
                </div>
                <Button variant="outline">Clear filters</Button>
              </div>
            </Group>
            <Group title="Loading" className="block">
              <div role="status" aria-busy="true">
                <span className="sr-only">Loading leads</span>
                <LeadTable>
                  {[0, 1, 2, 3, 4].map((row) => (
                    <TableRow key={row} className="hover:bg-transparent">
                      <TableCell>
                        <Skeleton className="h-3.5 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-3.5 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-3.5 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-6 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-3.5 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-3.5 w-10" />
                      </TableCell>
                    </TableRow>
                  ))}
                </LeadTable>
              </div>
            </Group>
            <Group title="Error" className="block">
              <div
                role="alert"
                className="flex flex-col gap-3 rounded-lg border border-tone-rejected-border bg-tone-rejected-surface p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="flex items-start gap-2 text-sm text-tone-rejected">
                  <WarningCircle aria-hidden size={16} weight="fill" className="mt-0.5 shrink-0" />
                  The leads did not load because the connection dropped. Check your connection and try again.
                </p>
                <Button variant="outline" className="shrink-0 bg-card">
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
          note="Menus, popovers, dialogs and tooltips are the only surfaces that carry a shadow."
        >
          <OverlayDemos />
        </Section>
      </main>
    </div>
  );
}
