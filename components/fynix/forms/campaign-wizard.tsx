"use client";

import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import Link from "next/link";
import { cn } from "cn";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Notice } from "@/components/auth/notice";
import { SubmitButton } from "@/components/auth/submit-button";
import { Tonal } from "@/components/kit/panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { QualifyingQuestionsView } from "@/components/campaigns/qualifying-questions";
import { RichText } from "@/components/ui/rich-text";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { meetingTerms, REPORTING_PROTOCOL } from "@/lib/fynix/campaign-terms";
import { browserTimeZone } from "@/lib/fynix/time-zones";
import type { QualifyingItem } from "@/lib/qualifying-items";
import { isHtmlEmpty } from "@/lib/rich-text-view";
import type { CampaignChoices, CampaignHeader } from "@/server/domain/campaign-overview";
import { createCampaignAction, updateCampaignAction } from "@/server/fynix/actions";
import { ActionForm, useFormState } from "./action-form";
import { FormGroup, Hidden, NumberField, SelectField, TextAreaField, TextField, TimeZoneField } from "./form-parts";
import { AgreementFields } from "./campaign-agreement-fields";
import { BrandFields, QualificationFields, QuestionsFields } from "./campaign-forms";

type Snapshot = Readonly<Record<string, string>>;

/** The client and the coordinator the form starts with, when it is opened from one of their pages. */
type Initial = { readonly clientId?: string | undefined; readonly coordinatorId?: string | undefined };

/** What step 1 cannot be left without. Everything else is optional or has a default. */
const REQUIRED: readonly (readonly [string, string])[] = [
  ["name", "Campaign name"],
  ["clientOrgId", "Client"],
  ["agencyOrgId", "Coordinator"],
  ["startDate", "Start date"],
  ["endDate", "End date"],
  ["monthlyTarget", "Meetings per month"],
  ["totalTarget", "Meetings in total"],
];

const longDate = (iso: string): string => (iso === "" ? "Not set" : new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }));

/**
 * The client, then the contact person who approves its leads. The list holds the client's contact people and follows the client chosen:
 * changing the client clears the person, because they belong to it. A client with no contact people says so and the campaign can still be made.
 */
function ClientAndContact({ choices, initialClient }: { choices: CampaignChoices; initialClient: string }) {
  const state = useFormState();
  const clientId = useId();
  const contactId = useId();
  const [client, setClient] = useState(initialClient);
  const [contact, setContact] = useState("");
  const error = (name: string) => (state.status === "error" ? state.fields[name] : undefined);
  const people = choices.contacts.filter((person) => person.clientOrgId === client);

  return (
    <>
      <Field id={clientId} label="Client" error={error("clientOrgId")}>
        <Choice
          id={clientId}
          name="clientOrgId"
          value={client}
          onValueChange={(next) => {
            setClient(next);
            setContact("");
          }}
          options={choices.clients.map((row) => ({ value: row.id, label: row.name }))}
          placeholder="Choose the client"
          invalid={error("clientOrgId") !== undefined}
        />
      </Field>
      <Field
        id={contactId}
        label="Contact person"
        helper={client === "" ? "Choose the client first. This person approves the leads and gives feedback." : people.length === 0 ? "This client has no contact people yet. Add them on the client page, or leave this empty for now." : "Approves the leads and gives feedback for this campaign."}
        error={error("primaryContactId")}
      >
        <Choice
          id={contactId}
          name="primaryContactId"
          value={contact}
          onValueChange={setContact}
          options={people.map((person) => ({ value: person.id, label: person.jobTitle === null ? person.name : `${person.name}, ${person.jobTitle}` }))}
          placeholder={client === "" ? "Choose the client first" : "Choose a contact person"}
          emptyLabel={client === "" ? "Choose the client first" : "No contact people yet"}
          invalid={error("primaryContactId") !== undefined}
        />
      </Field>
    </>
  );
}

function Row({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-0.5 rounded-md bg-surface px-3.5 py-3", wide && "md:col-span-2")}>
      <dt className="text-caption font-semibold text-ink-muted">{label}</dt>
      <dd className="text-row font-medium text-ink">{children}</dd>
    </div>
  );
}

const NOT_SET = <span className="font-normal text-ink-muted">Not set</span>;
const plain = (value: string | undefined): React.ReactNode => (value === undefined || value.trim() === "" ? NOT_SET : value);
const rich = (value: string | undefined): React.ReactNode => (value === undefined || isHtmlEmpty(value) ? NOT_SET : <RichText value={value} className="font-normal" />);

function parseItems(value: string | undefined): QualifyingItem[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? (parsed as QualifyingItem[]).filter((item) => !isHtmlEmpty(item.question) || !isHtmlEmpty(item.answer)) : [];
  } catch {
    return [];
  }
}

function SummarySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Tonal className="flex flex-col gap-3" aria-label={title}>
      <h3 className="text-row font-semibold">{title}</h3>
      <dl className="grid gap-2.5 md:grid-cols-2">{children}</dl>
    </Tonal>
  );
}

type Mode = { readonly kind: "create"; readonly choices: CampaignChoices; readonly initial: Initial } | { readonly kind: "edit"; readonly campaign: CampaignHeader };

/** The last tab: everything entered in the other tabs, laid out to read, then (for a new campaign) the meeting terms and the reporting protocol, read only. */
function Summary({ snapshot, mode, missing, onFix }: { snapshot: Snapshot; mode: Mode; missing: readonly string[]; onFix: () => void }) {
  const clientName = mode.kind === "create" ? (mode.choices.clients.find((row) => row.id === snapshot.clientOrgId)?.name ?? "Not chosen") : mode.campaign.clientName;
  const coordinatorName = mode.kind === "create" ? (mode.choices.coordinators.find((row) => row.id === snapshot.agencyOrgId)?.name ?? "Not chosen") : mode.campaign.coordinatorName;
  const people = mode.kind === "create" ? mode.choices.contacts : mode.campaign.clientContacts;
  const contact = people.find((person) => person.id === snapshot.primaryContactId) ?? null;
  const items = parseItems(snapshot.qualifyingItems);
  const terms = meetingTerms(contact?.name ?? null);
  return (
    <div className="flex flex-col gap-4">
      {missing.length > 0 ? (
        <Notice tone="red">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {`Fill in ${missing.join(", ")} before ${mode.kind === "create" ? "creating the campaign" : "saving"}.`}
            <button type="button" onClick={onFix} className="font-semibold underline underline-offset-2">
              Go to the Campaign tab
            </button>
          </span>
        </Notice>
      ) : null}

      <SummarySection title="Campaign">
        <Row label="Campaign">{plain(snapshot.name)}</Row>
        <Row label="Client">{clientName}</Row>
        <Row label="Contact person">{contact === null ? "None chosen" : contact.jobTitle === null ? contact.name : `${contact.name}, ${contact.jobTitle}`}</Row>
        <Row label="Coordinator">{coordinatorName}</Row>
        <Row label="Runs">{`${longDate(snapshot.startDate ?? "")} to ${longDate(snapshot.endDate ?? "")}`}</Row>
        <Row label="Meetings">{`${snapshot.monthlyTarget ?? ""} a month, ${snapshot.totalTarget ?? ""} in total`}</Row>
        <Row label="Time zone">{snapshot.timeZone === undefined || snapshot.timeZone === "" ? "Europe/London" : snapshot.timeZone}</Row>
        {mode.kind === "edit" ? <Row label="Meeting length">{`${snapshot.meetingMinutes ?? ""} minutes`}</Row> : null}
      </SummarySection>

      {mode.kind === "create" ? (
        <SummarySection title="Agreement">
          <Row label="Publishing">{snapshot.publishAgreement === "later" ? "Later, from the campaign page. The campaign cannot go live until it is published and accepted." : "Now, when the campaign is created. The managers of the client and the coordinator are told."}</Row>
          <Row label="Counting rules" wide>
            {plain(snapshot.agreementRules)}
          </Row>
        </SummarySection>
      ) : null}

      <SummarySection title="Brand and service information">
        <Row label="How the client is introduced" wide>
          {rich(snapshot.pitchIntroduction)}
        </Row>
        <Row label="Services" wide>
          {rich(snapshot.pitchServices)}
        </Row>
        <Row label="What sets them apart" wide>
          {rich(snapshot.pitchDifferentiator)}
        </Row>
        <Row label="Marketing collaterals" wide>
          {rich(snapshot.pitchCollaterals)}
        </Row>
        <Row label="Case studies" wide>
          {rich(snapshot.pitchCaseStudies)}
        </Row>
      </SummarySection>

      <SummarySection title="Qualification criteria">
        <Row label="Target decision-makers">{plain(snapshot.jobTitles)}</Row>
        <Row label="Target industries">{plain(snapshot.industries)}</Row>
        <Row label="Target geographical markets">{plain(snapshot.geography)}</Row>
      </SummarySection>

      <SummarySection title="Critical qualifying questions">
        <Row label="Questions" wide>
          {items.length === 0 ? NOT_SET : <QualifyingQuestionsView items={items} legacyText="" />}
        </Row>
      </SummarySection>

      {mode.kind === "create" ? (
        <>
          <p className="text-xs text-muted-foreground">The campaign starts as a draft. Agencies are added later through the coordinator&apos;s shares.</p>
          <Tonal className="flex flex-col gap-3" aria-label="Meeting terms and conditions">
            <h3 className="text-row font-semibold">Meeting terms and conditions</h3>
            <ol className="flex flex-col gap-3">
              {terms.map((row, index) => (
                <li key={row.term} className="grid gap-1 rounded-md bg-surface px-3.5 py-3 md:grid-cols-[2rem_12rem_1fr] md:gap-3">
                  <span className="text-caption font-semibold text-ink-muted tabular-nums">{index + 1}</span>
                  <span className="text-row font-semibold text-ink">{row.term}</span>
                  <span className="text-row text-ink-2">{row.description}</span>
                </li>
              ))}
            </ol>
          </Tonal>
          <Tonal className="flex flex-col gap-3" aria-label="Communication and reporting protocol">
            <h3 className="text-row font-semibold">Communication and reporting protocol</h3>
            <ol className="flex flex-col gap-3">
              {REPORTING_PROTOCOL.map((text, index) => (
                <li key={text} className="grid gap-1 rounded-md bg-surface px-3.5 py-3 md:grid-cols-[2rem_1fr] md:gap-3">
                  <span className="text-caption font-semibold text-ink-muted tabular-nums">{index + 1}</span>
                  <span className="text-row text-ink-2">{text}</span>
                </li>
              ))}
            </ol>
          </Tonal>
        </>
      ) : null}
    </div>
  );
}

type TabKey = "campaign" | "brand" | "qualification" | "questions" | "agreement" | "summary";

/** In the order of the set-up sheet; the last tab is the summary, where the campaign is created or saved. Every tab stays in the page, so all of them post with the form. */
const TABS: readonly { readonly value: TabKey; readonly label: string }[] = [
  { value: "campaign", label: "Campaign" },
  { value: "brand", label: "Brand and service" },
  { value: "qualification", label: "Qualification" },
  { value: "questions", label: "Qualifying questions" },
  { value: "agreement", label: "Agreement" },
  { value: "summary", label: "Summary" },
];

/** A campaign being edited has no Agreement tab: its agreement is published and accepted from the campaign page. */
const tabsFor = (mode: { readonly kind: "create" | "edit" }): typeof TABS => (mode.kind === "create" ? TABS : TABS.filter((entry) => entry.value !== "agreement"));

/** The tab a form field lives in, so a problem the server found opens the tab that holds it. */
function tabOf(field: string): TabKey {
  if (field.startsWith("pitch")) return "brand";
  if (field === "jobTitles" || field === "industries" || field === "geography") return "qualification";
  if (field === "qualifyingQuestions" || field === "qualifyingItems") return "questions";
  return "campaign";
}

/** The Campaign tab of a campaign being edited: the client and the coordinator stay as they were, so they are not asked again. */
function EditCampaignTab({ campaign }: { campaign: CampaignHeader }) {
  const { brief } = campaign;
  return (
    <>
      <Hidden name="campaignId" value={campaign.id} />
      <FormGroup title="Campaign">
        <TextField name="name" label="Campaign name" defaultValue={campaign.name} />
        <SelectField
          name="primaryContactId"
          label="Contact person"
          options={campaign.clientContacts.map((person) => ({ value: person.id, label: person.jobTitle === null ? person.name : `${person.name}, ${person.jobTitle}` }))}
          defaultValue={brief.primaryContactId ?? ""}
          placeholder="No contact person chosen"
          helper={campaign.clientContacts.length === 0 ? "This client has no contact people yet. Add them on the client page." : "Approves the leads and gives feedback for this campaign."}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField name="startDate" label="Starts" type="date" defaultValue={brief.startDate} />
          <TextField name="endDate" label="Ends" type="date" defaultValue={brief.endDate} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField name="monthlyTarget" label="Meetings per month" defaultValue={String(brief.monthlyTarget)} />
          <NumberField name="totalTarget" label="Meetings in total" defaultValue={String(brief.totalTarget)} />
        </div>
        <TimeZoneField defaultValue={campaign.timeZone} helper="Counting uses it. Search, or type Area/City." />
        <NumberField name="meetingMinutes" label="Meeting length, minutes" defaultValue={String(campaign.meetingMinutes)} />
      </FormGroup>
      <FormGroup title="For Fynix">
        <TextAreaField name="internalNotes" label="Internal notes" defaultValue={brief.internalNotes ?? ""} helper="For Fynix only. Nobody outside Fynix sees this." />
      </FormGroup>
    </>
  );
}

/** The browser's zone does not change while the page is open, so there is nothing to subscribe to. */
const subscribeNothing = (): (() => void) => () => undefined;

function CreateCampaignTab({ choices, initial }: { choices: CampaignChoices; initial: Initial }) {
  // A new campaign starts in the zone of the browser it is made in (the server cannot know it). Until the browser answers, and if it never does, it is London.
  const zone = useSyncExternalStore(subscribeNothing, () => browserTimeZone() ?? "Europe/London", () => "Europe/London");
  return (
    <FormGroup title="Campaign">
      <TextField name="name" label="Campaign name" />
      <ClientAndContact choices={choices} initialClient={initial.clientId ?? ""} />
      <SelectField name="agencyOrgId" label="Coordinator" options={choices.coordinators.map((row) => ({ value: row.id, label: row.name }))} placeholder="Choose the coordinator" defaultValue={initial.coordinatorId ?? ""} helper="The coordinator then gives the campaign to its own agencies." />
      <div className="grid grid-cols-2 gap-3">
        <TextField name="startDate" label="Starts" type="date" />
        <TextField name="endDate" label="Ends" type="date" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumberField name="monthlyTarget" label="Meetings per month" />
        <NumberField name="totalTarget" label="Meetings in total" helper="The package." />
      </div>
      <TimeZoneField key={zone} defaultValue={zone} helper="Counting uses it. It starts as the zone of this browser. Search, or type Area/City." />
    </FormGroup>
  );
}

function Steps({ tab, goTo, mode, snapshot, missing }: { tab: TabKey; goTo: (tab: TabKey, form: HTMLFormElement | null) => void; mode: Mode; snapshot: Snapshot; missing: readonly string[] }) {
  const state = useFormState();
  const root = useRef<HTMLDivElement>(null);
  // A problem the server found sends the person to the tab and the box it names.
  useEffect(() => {
    if (state.status !== "error") return;
    const first = Object.keys(state.fields)[0];
    if (first !== undefined) goTo(tabOf(first), null);
  }, [state, goTo]);

  const brief = mode.kind === "edit" ? mode.campaign.brief : null;
  return (
    <div ref={root} className="flex flex-col gap-4">
      {missing.length > 0 && tab === "campaign" ? <Notice tone="red">{`Fill in ${missing.join(", ")} to continue.`}</Notice> : null}
      <Tabs value={tab} onValueChange={(next) => goTo(next as TabKey, root.current?.closest("form") ?? null)} className="gap-4">
        <TabsList variant="line" aria-label="Campaign details">
          {tabsFor(mode).map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value}>
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="campaign" keepMounted>
          {mode.kind === "create" ? <CreateCampaignTab choices={mode.choices} initial={mode.initial} /> : <EditCampaignTab campaign={mode.campaign} />}
        </TabsContent>
        <TabsContent value="brand" keepMounted>
          <BrandFields brief={brief} />
        </TabsContent>
        <TabsContent value="qualification" keepMounted>
          <QualificationFields brief={brief} />
        </TabsContent>
        <TabsContent value="questions" keepMounted>
          <QuestionsFields brief={brief} />
        </TabsContent>
        {mode.kind === "create" ? (
          <TabsContent value="agreement" keepMounted>
            <AgreementFields />
          </TabsContent>
        ) : null}
        <TabsContent value="summary">
          <Summary snapshot={snapshot} mode={mode} missing={missing} onFix={() => goTo("campaign", null)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** What each mode cannot go ahead without. Everything else is optional or has a default. */
const EDIT_REQUIRED: readonly (readonly [string, string])[] = [
  ["name", "Campaign name"],
  ["startDate", "Start date"],
  ["endDate", "End date"],
  ["monthlyTarget", "Meetings per month"],
  ["totalTarget", "Meetings in total"],
];

/**
 * The campaign form, on a page of its own, used to create a campaign and to edit one. The details are in tabs, in the order of the set-up sheet;
 * the last tab is the summary of everything entered, with (for a new campaign) the meeting terms and the reporting protocol, read only. Continue
 * moves along the tabs and the last one has the button that creates or saves. The campaign starts as a draft, and the client and the coordinator stay fixed after it.
 */
function CampaignEditor({ mode, cancelHref }: { mode: Mode; cancelHref: string }) {
  const [tab, setTab] = useState<TabKey>("campaign");
  const [snapshot, setSnapshot] = useState<Snapshot>({});
  const [missing, setMissing] = useState<readonly string[]>([]);
  const required = mode.kind === "create" ? REQUIRED : EDIT_REQUIRED;

  const goTo = useCallback(
    (next: TabKey, form: HTMLFormElement | null) => {
      if (next === "summary" && form !== null) {
        const data = new FormData(form);
        const values = Object.fromEntries([...data.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"));
        setSnapshot(values);
        setMissing(required.filter(([name]) => (values[name] ?? "").trim() === "").map(([, label]) => label));
      }
      setTab(next);
      window.scrollTo({ top: 0 });
    },
    [required],
  );

  const tabs = tabsFor(mode);
  const index = tabs.findIndex((entry) => entry.value === tab);
  const nextTab = tabs[index + 1]?.value;
  const previousTab = tabs[index - 1]?.value;
  const create = mode.kind === "create";

  return (
    <ActionForm
      action={create ? createCampaignAction : updateCampaignAction}
      submitLabel={create ? "Create campaign" : "Save changes"}
      pendingLabel={create ? "Creating" : "Saving"}
      page={{
        cancelHref,
        footer: (pending) => (
          <>
            <Link href={cancelHref} className={buttonVariants({ variant: "secondary" })}>
              Cancel
            </Link>
            {previousTab === undefined ? null : (
              <Button type="button" variant="secondary" onClick={(event) => goTo(previousTab, event.currentTarget.form)}>
                <ArrowLeft aria-hidden />
                Back
              </Button>
            )}
            <div className="w-full sm:w-56">
              {nextTab === undefined ? (
                missing.length > 0 ? (
                  <Button type="button" className="w-full" disabled>
                    {create ? "Create campaign" : "Save changes"}
                  </Button>
                ) : (
                  <SubmitButton pending={pending} label={create ? "Create campaign" : "Save changes"} pendingLabel={create ? "Creating" : "Saving"} />
                )
              ) : (
                <Button type="button" className="w-full" onClick={(event) => goTo(nextTab, event.currentTarget.form)}>
                  Continue
                  <ArrowRight aria-hidden />
                </Button>
              )}
            </div>
          </>
        ),
      }}
    >
      <Steps tab={tab} goTo={goTo} mode={mode} snapshot={snapshot} missing={missing} />
    </ActionForm>
  );
}

/** New campaign: the tabs, then the summary with the meeting terms, where Create campaign is. */
export function CreateCampaignWizard({ choices, cancelHref, initial = {} }: { choices: CampaignChoices; cancelHref: string; initial?: Initial }) {
  return <CampaignEditor mode={{ kind: "create", choices, initial }} cancelHref={cancelHref} />;
}

/** Edit campaign: the same tabs, filled with what is stored, and a summary where Save changes is. The client and the coordinator are not asked again. */
export function EditCampaignEditor({ campaign, cancelHref }: { campaign: CampaignHeader; cancelHref: string }) {
  return <CampaignEditor mode={{ kind: "edit", campaign }} cancelHref={cancelHref} />;
}
