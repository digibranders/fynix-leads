import { Table as TableIcon, Tray } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OverlayDemos } from "@/components/dev/overlay-demos";
import { Group, Section, Specimen } from "@/components/dev/specimen";
import { EmptyState } from "@/components/kit/empty-state";
import { Facts, Quote } from "@/components/kit/facts";
import { Hero } from "@/components/kit/hero";
import { DateTile, ListRow } from "@/components/kit/list";
import { Panel, PanelHeader, Tonal } from "@/components/kit/panel";
import { Person } from "@/components/kit/person";
import { StageBar } from "@/components/kit/stage-bar";
import { Meter, MiniStat } from "@/components/kit/stat";
import { StatusChip } from "@/components/kit/status-chip";
import { TabNav } from "@/components/kit/tab-nav";
import { Toolbar, SearchForm } from "@/components/kit/toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { LEAD_STAGES } from "@/lib/leads/stage";
import { PIPELINE_GROUPS } from "@/lib/leads/pipeline";

export const metadata: Metadata = { title: "Design system" };

const SECTIONS = [
  ["surfaces", "Surfaces"],
  ["colour", "Colour"],
  ["type", "Type"],
  ["shape", "Shape and shadow"],
  ["buttons", "Buttons"],
  ["controls", "Form controls"],
  ["status", "Status"],
  ["navigation", "Navigation"],
  ["figures", "Figures"],
  ["table", "Table and lists"],
  ["states", "States"],
  ["overlays", "Overlays"],
] as const;

const BRAND = [
  ["--navy", "#0C1E2E", "Sidebar, hero, primary button, ink"],
  ["--peach", "#E9AF88", "The one accent: active place, selection, progress on navy"],
  ["--peach-deep", "#A9602F", "Peach as text on white"],
  ["--selected", "#FBF1E7", "Selected row, next meeting"],
  ["--canvas", "#F4F2EE", "The page"],
  ["--surface", "#FFFFFF", "Panels"],
  ["--ctl-edge", "#87929F", "Form control edge, 3.1:1"],
] as const;

const STATUS = [
  ["amber", "Waiting on someone", "bg-amber-soft text-amber-text"],
  ["blue", "Booked or in progress", "bg-blue-soft text-blue-text"],
  ["teal", "Outcome due", "bg-teal-soft text-teal-text"],
  ["green", "Done or healthy", "bg-green-soft text-green-text"],
  ["red", "A problem", "bg-red-soft text-red-text"],
  ["grey", "Ended or inactive", "bg-navy-05 text-ink-2"],
] as const;

const TYPE = [
  ["text-display", "46", "The hero figure"],
  ["text-name", "26", "A record's name"],
  ["text-title", "22", "Page title"],
  ["text-section", "15", "Panel title"],
  ["text-body", "13.5", "Body, buttons, inputs"],
  ["text-table", "13", "Table cells"],
  ["text-caption", "12", "Muted second lines"],
] as const;

const RADII = [
  ["rounded-xs", "6", "Chips, key caps"],
  ["rounded-sm", "9", "Controls, rows, avatars"],
  ["rounded-md", "12", "Tonal blocks, popovers"],
  ["rounded-lg", "14", "Panels"],
  ["rounded-xl", "18", "Dialogs, drawers"],
] as const;

const ROWS = [
  { name: "Marta Lindqvist", title: "Head of Logistics", ref: "LD-3K7M", company: "Nordvik Cold Chain", stage: "awaiting_client" as const },
  { name: "Ingrid Sørensen", title: "VP Supply Chain", ref: "LD-8T4V", company: "Fjordline Distribution", stage: "scheduled" as const },
  { name: "Priya Raman", title: "Director of Distribution", ref: "LD-4B9C", company: "Greenfield Markets", stage: "delivered" as const },
];

export default function DesignSystemPage() {
  // A review page for the team: it is not a product screen, so a production build does not serve it.
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 md:px-6">
      <header className="flex flex-col gap-3 py-8">
        <Link href="/" className="w-fit text-label font-semibold text-ink-muted underline-offset-4 hover:text-ink hover:underline">
          Back to the app
        </Link>
        <h1 className="text-title font-semibold tracking-title">Design system</h1>
        <p className="max-w-prose text-body text-ink-muted">Every token and component of Ledger Soft as it ships. Source of truth: DESIGN.md.</p>
        <nav aria-label="Sections" className="mt-1">
          <ul className="flex flex-wrap gap-2">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="inline-flex h-8 items-center rounded-sm bg-navy-05 px-3 text-label font-semibold text-ink-2 hover:bg-navy-08 max-md:h-10">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="flex flex-col gap-4">
        <Section id="surfaces" title="Surfaces" note="Tone and a ring shadow separate surfaces. No outlines. A tonal block never contains another one.">
          <div className="grid gap-4 rounded-lg bg-canvas p-5 sm:grid-cols-4">
            <Specimen caption="Canvas" fill>
              <div className="h-24 rounded-lg bg-canvas shadow-[inset_0_0_0_1px_var(--line)]" />
            </Specimen>
            <Specimen caption="Panel" fill>
              <div className="h-24 rounded-lg bg-surface shadow-raised" />
            </Specimen>
            <Specimen caption="Tonal block" fill>
              <div className="h-24 rounded-md bg-tonal" />
            </Specimen>
            <Specimen caption="Hero (navy)" fill>
              <div className="h-24 rounded-lg bg-navy shadow-hero" />
            </Specimen>
          </div>
        </Section>

        <Section id="colour" title="Colour" note="Navy and one peach accent. Colour carries status only.">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BRAND.map(([token, value, role]) => (
              <li key={token} className="flex items-center gap-3">
                <span className="size-10 shrink-0 rounded-sm shadow-[inset_0_0_0_1px_rgba(12,30,46,0.1)]" style={{ background: `var(${token})` }} />
                <span className="text-table leading-tight">
                  <b className="font-semibold">{token}</b> <span className="font-mono text-caption text-ink-muted">{value}</span>
                  <span className="block text-ink-muted">{role}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="type" title="Type" note="Geist Sans and Geist Mono, tabular numbers, sentence case. No serif.">
          <ul className="flex flex-col gap-3">
            {TYPE.map(([cls, size, use]) => (
              <li key={cls} className="grid items-baseline gap-x-4 sm:grid-cols-[130px_1fr]">
                <span className="font-mono text-caption text-ink-muted">
                  {cls} {size}
                </span>
                <span className={cls}>
                  {use} <span className="text-ink-muted">1,284 delivered</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="shape" title="Shape and shadow" note="One radius scale, one rule. The shadow is a 5% ring, a contact shadow and a long soft one, tinted navy.">
          <div className="grid gap-5 rounded-lg bg-canvas p-5 sm:grid-cols-5">
            {RADII.map(([cls, px, use]) => (
              <Specimen key={cls} caption={`${cls} ${px}px, ${use}`} fill>
                <div className={`h-20 bg-surface shadow-raised ${cls}`} />
              </Specimen>
            ))}
          </div>
        </Section>

        <Section id="buttons" title="Buttons" note="One primary action per surface. Secondary is tonal, never outlined. Actions are labelled.">
          <div className="flex flex-col gap-6">
            <Group title="Variants">
              <Button>Accept this time</Button>
              <Button variant="secondary">Export CSV</Button>
              <Button variant="destructive">Decline lead</Button>
              <Button variant="ghost">Cancel</Button>
              <Button variant="ghost-destructive">Dispute</Button>
              <Button disabled>Disabled</Button>
            </Group>
            <Group title="Sizes">
              <Button size="lg">Large 40</Button>
              <Button>Default 34</Button>
              <Button size="sm">Small 30</Button>
              <Button size="xs">Extra small 26</Button>
            </Group>
            <Group title="On navy" className="rounded-md bg-navy p-4">
              <Button variant="peach" size="lg">
                <Tray aria-hidden weight="bold" />
                Start reviewing
              </Button>
              <Button variant="onNavy">All leads</Button>
            </Group>
          </div>
        </Section>

        <Section id="controls" title="Form controls" note="A tonal fill with a 3:1 edge. Focus thickens the edge to navy, an error turns it red with a message. Label above, message below.">
          <div className="grid gap-5 md:grid-cols-2">
            <Field id="ds-name" label="Prospect name" helper="As the prospect writes it.">
              <Input id="ds-name" defaultValue="Marta Lindqvist" aria-describedby="ds-name-message" />
            </Field>
            <Field id="ds-email" label="Work email" error="Enter an email address, like name@company.example.">
              <Input id="ds-email" defaultValue="marta@" aria-invalid aria-describedby="ds-email-message" />
            </Field>
            <Field id="ds-stage" label="Stage">
              <Choice id="ds-stage" options={LEAD_STAGES.map((value) => ({ value, label: value.replace(/_/g, " ") }))} placeholder="Choose a stage" />
            </Field>
            <Field id="ds-note" label="Note" helper="Visible to Fynix.">
              <Textarea id="ds-note" defaultValue="Replied to the second outreach and asked for a short call." aria-describedby="ds-note-message" />
            </Field>
          </div>
        </Section>

        <Section id="status" title="Status" note="A word in a tint. Six colours, each with one meaning. Every lead stage maps to one.">
          <div className="flex flex-col gap-6">
            <ul className="grid gap-3 sm:grid-cols-3">
              {STATUS.map(([name, meaning, cls]) => (
                <li key={name} className="flex items-center gap-3">
                  <span className={`inline-flex h-6 items-center rounded-xs px-2 text-xs font-semibold ${cls}`}>{name}</span>
                  <span className="text-table text-ink-muted">{meaning}</span>
                </li>
              ))}
            </ul>
            <Group title="Lead stages">
              {LEAD_STAGES.map((stage) => (
                <StatusChip key={stage} kind="lead" status={stage} />
              ))}
            </Group>
            <Group title="Sizes and badges">
              <StatusChip kind="lead" status="scheduled" size="sm" />
              <StatusChip kind="lead" status="scheduled" />
              <Badge variant="peach">3 waiting</Badge>
              <Badge variant="quiet">Draft</Badge>
            </Group>
          </div>
        </Section>

        <Section id="navigation" title="Navigation" note="A filter that lives in the URL is a link, so a view can be shared and the back button works.">
          <div className="flex flex-col gap-6">
            <Group title="Tabs with counts (links)">
              <TabNav
                label="Example"
                items={[
                  { label: "Awaiting you", href: "#navigation", count: 2, active: true },
                  { label: "Responded", href: "#navigation", count: 48, active: false },
                ]}
              />
            </Group>
            <Group title="Segmented control" className="w-full">
              <Tabs defaultValue="week">
                <TabsList>
                  <TabsTrigger value="week">Week</TabsTrigger>
                  <TabsTrigger value="month">Month</TabsTrigger>
                  <TabsTrigger value="quarter">Quarter</TabsTrigger>
                </TabsList>
              </Tabs>
            </Group>
            <StageBar
              allHref="#navigation"
              allCount={50}
              allActive
              segments={PIPELINE_GROUPS.map((group, index) => ({
                key: group.key,
                label: group.label,
                count: [2, 4, 3, 31, 1, 9][index] ?? 0,
                color: group.color,
                href: "#navigation",
              }))}
            />
          </div>
        </Section>

        <Section id="figures" title="Figures" note="One hero per screen, then small stats. A trend line is drawn only when there is a series to draw.">
          <div className="flex flex-col gap-4">
            <Hero
              kicker="Needs your response"
              title="2 leads are waiting for you"
              description="The oldest was submitted 2d 21h ago, from Dalefield Foods."
              actions={
                <Button variant="peach" size="lg">
                  <Tray aria-hidden weight="bold" />
                  Start reviewing
                </Button>
              }
              aside={
                <>
                  <p className="text-label font-semibold text-peach">Accepted this month</p>
                  <p className="text-display font-semibold tracking-figure">
                    31<span className="text-[20px] font-medium tracking-normal text-on-navy-muted"> / 50</span>
                  </p>
                  <Meter onNavy value={31} max={50} label="Accepted against target" />
                  <p className="text-body text-on-navy-text">19 to go</p>
                </>
              }
            />
            <div className="grid gap-4 md:grid-cols-3">
              <MiniStat label="Meetings scheduled" value={4} foot="Next: Thu 26 Nov, 4:30 pm IST" trend={[2, 3, 3, 5, 4, 6, 4]} tone="blue" />
              <MiniStat label="Outcome due" value={3} foot="Calls held, outcome not recorded" />
              <MiniStat label="Disputes" value={1} foot="Under review by Fynix" />
            </div>
          </div>
        </Section>

        <Section id="table" title="Table and lists" note="A tonal header band, a 6% line between rows, 52px rows, a wash on hover.">
          <Panel className="bg-canvas shadow-none">
            <div className="flex flex-col gap-4">
              <Panel>
                <Toolbar trailing="3 leads">
                  <SearchForm placeholder="Search by name, company or reference" />
                </Toolbar>
                <div className="px-2.5 pb-3">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Prospect</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Stage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ROWS.map((row, index) => (
                        <TableRow key={row.ref} data-state={index === 0 ? "selected" : undefined}>
                          <TableCell>
                            <Person name={row.name} sub={<span className="font-mono">{row.ref}</span>} />
                          </TableCell>
                          <TableCell>{row.company}</TableCell>
                          <TableCell>
                            <StatusChip kind="lead" status={row.stage} size="sm" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Panel>
              <div className="grid gap-4 md:grid-cols-2">
                <Panel>
                  <PanelHeader title="Upcoming meetings" count={2} />
                  <ul className="pb-3">
                    <ListRow highlight leading={<DateTile date={new Date("2026-11-26T11:00:00Z")} />} title="Ingrid Sørensen" sub="Fjordline Distribution" trailing="4:30 pm IST" />
                    <ListRow leading={<DateTile date={new Date("2026-11-29T12:00:00Z")} />} title="Callum Reid" sub="Tarnbrook Grocers" trailing="5:30 pm IST" />
                  </ul>
                </Panel>
                <Panel className="p-5">
                  <Facts
                    items={[
                      ["Budget", "Confirmed for this financial year"],
                      ["Timeline", "Decision within one quarter"],
                    ]}
                  />
                  <div className="mt-4">
                    <Quote>Replied to the second outreach and asked for a short call.</Quote>
                  </div>
                </Panel>
              </div>
            </div>
          </Panel>
        </Section>

        <Section id="states" title="States" note="Loading is the shape of what is coming. Empty says what is missing and what to do.">
          <div className="grid gap-4 md:grid-cols-2">
            <Tonal className="flex flex-col gap-3" aria-busy="true">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-64 max-w-full" />
              <Skeleton className="h-24" />
            </Tonal>
            <Panel className="shadow-none">
              <EmptyState icon={TableIcon} title="No leads yet" action={<Button variant="secondary">Submit a lead</Button>}>
                Prospects appear here as soon as they are submitted for the campaign.
              </EmptyState>
            </Panel>
          </div>
        </Section>

        <Section id="overlays" title="Overlays" note="A drawer for forms, a dialog when words or a confirmation are needed, a toast for a transient confirmation.">
          <OverlayDemos />
        </Section>
      </main>
    </div>
  );
}
