"use client";

import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Notice } from "@/components/auth/notice";
import { SubmitButton } from "@/components/auth/submit-button";
import { Tonal } from "@/components/kit/panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { meetingTerms, REPORTING_PROTOCOL } from "@/lib/fynix/campaign-terms";
import type { CampaignChoices } from "@/server/domain/campaign-overview";
import { createCampaignAction } from "@/server/fynix/actions";
import { ActionForm, useFormState } from "./action-form";
import { FormGroup, NumberField, SelectField, TextField, TimeZoneField } from "./form-parts";
import { BrandFields, EmailFields, QualificationFields, QuestionsFields } from "./campaign-forms";

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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-surface px-3.5 py-3">
      <dt className="text-caption font-semibold text-ink-muted">{label}</dt>
      <dd className="text-row font-medium text-ink">{children}</dd>
    </div>
  );
}

/** Step 2: what was entered in short, then the terms and the reporting protocol, read only. */
function Review({ snapshot, choices }: { snapshot: Snapshot; choices: CampaignChoices }) {
  const clientName = choices.clients.find((row) => row.id === snapshot.clientOrgId)?.name ?? "Not chosen";
  const coordinatorName = choices.coordinators.find((row) => row.id === snapshot.agencyOrgId)?.name ?? "Not chosen";
  const contact = choices.contacts.find((person) => person.id === snapshot.primaryContactId) ?? null;
  const terms = meetingTerms(contact?.name ?? null);
  return (
    <div className="flex flex-col gap-4">
      <FormGroup title="Review">
        <dl className="grid gap-2.5 md:col-span-2 md:grid-cols-2">
          <Row label="Campaign">{snapshot.name}</Row>
          <Row label="Client">{clientName}</Row>
          <Row label="Contact person">{contact === null ? "None chosen" : contact.name}</Row>
          <Row label="Coordinator">{coordinatorName}</Row>
          <Row label="Runs">{`${longDate(snapshot.startDate ?? "")} to ${longDate(snapshot.endDate ?? "")}`}</Row>
          <Row label="Meetings">{`${snapshot.monthlyTarget} a month, ${snapshot.totalTarget} in total`}</Row>
          <Row label="Time zone">{snapshot.timeZone === "" ? "Europe/London" : snapshot.timeZone}</Row>
        </dl>
        <p className="text-xs text-muted-foreground md:col-span-2">The campaign starts as a draft. Agencies are added later through the coordinator&apos;s shares.</p>
      </FormGroup>

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
    </div>
  );
}

type TabKey = "campaign" | "brand" | "qualification" | "questions" | "emails";

/** Step 1 is split into tabs, in the order of the set-up sheet. Every tab stays in the page, so all of them post with the form. */
const TABS: readonly { readonly value: TabKey; readonly label: string }[] = [
  { value: "campaign", label: "Campaign" },
  { value: "brand", label: "Brand and service" },
  { value: "qualification", label: "Qualification" },
  { value: "questions", label: "Questions" },
  { value: "emails", label: "Emails" },
];

/** The tab a form field lives in, so a problem the server found opens the tab that holds it. */
function tabOf(field: string): TabKey {
  if (field.startsWith("pitch")) return "brand";
  if (field === "jobTitles" || field === "industries" || field === "geography") return "qualification";
  if (field === "qualifyingQuestions") return "questions";
  if (field === "firstEmail" || field === "secondEmail") return "emails";
  return "campaign";
}

/** The two steps live in one form, so going back keeps every answer: step 1 is only hidden on step 2, and still posts with the rest. */
function Steps({ step, setStep, tab, setTab, choices, snapshot, missing, initial }: { step: 1 | 2; setStep: (step: 1 | 2) => void; tab: TabKey; setTab: (tab: TabKey) => void; choices: CampaignChoices; snapshot: Snapshot; missing: readonly string[]; initial: Initial }) {
  const state = useFormState();
  // A problem the server found sends the person back to the tab and the box it names.
  useEffect(() => {
    if (state.status !== "error") return;
    setStep(1);
    const first = Object.keys(state.fields)[0];
    if (first !== undefined) setTab(tabOf(first));
  }, [state, setStep, setTab]);

  return (
    <>
      <div hidden={step !== 1} className="flex flex-col gap-4">
        {missing.length > 0 ? <Notice tone="red">{`Fill in ${missing.join(", ")} to continue.`}</Notice> : null}
        <Tabs value={tab} onValueChange={(next) => setTab(next as TabKey)} className="gap-4">
          <TabsList variant="line" aria-label="Campaign details">
            {TABS.map((entry) => (
              <TabsTrigger key={entry.value} value={entry.value}>
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="campaign" keepMounted>
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
              <TimeZoneField defaultValue="Europe/London" helper="Counting uses it. Search, or type Area/City." />
            </FormGroup>
          </TabsContent>
          <TabsContent value="brand" keepMounted>
            <BrandFields brief={null} />
          </TabsContent>
          <TabsContent value="qualification" keepMounted>
            <QualificationFields brief={null} />
          </TabsContent>
          <TabsContent value="questions" keepMounted>
            <QuestionsFields brief={null} />
          </TabsContent>
          <TabsContent value="emails" keepMounted>
            <EmailFields brief={null} />
          </TabsContent>
        </Tabs>
      </div>
      {step === 2 ? <Review snapshot={snapshot} choices={choices} /> : null}
    </>
  );
}

/**
 * New campaign in two steps on one page: the inputs, then a review that shows what was entered with the meeting terms and the reporting
 * protocol, read only. Create campaign is on the second step. The campaign starts as a draft, and the client and the coordinator stay fixed after it.
 */
export function CreateCampaignWizard({ choices, cancelHref, initial = {} }: { choices: CampaignChoices; cancelHref: string; initial?: Initial }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [tab, setTab] = useState<TabKey>("campaign");
  const [snapshot, setSnapshot] = useState<Snapshot>({});
  const [missing, setMissing] = useState<readonly string[]>([]);

  const goToReview = (form: HTMLFormElement | null) => {
    if (form === null) return;
    const data = new FormData(form);
    const values = Object.fromEntries([...data.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    const absent = REQUIRED.filter(([name]) => (values[name] ?? "").trim() === "").map(([, label]) => label);
    setMissing(absent);
    if (absent.length > 0) {
      // What is missing is on the first tab.
      setTab("campaign");
      return;
    }
    setSnapshot(values);
    setStep(2);
    window.scrollTo({ top: 0 });
  };

  return (
    <ActionForm
      action={createCampaignAction}
      submitLabel="Create campaign"
      pendingLabel="Creating"
      page={{
        cancelHref,
        footer: (pending) =>
          step === 1 ? (
            <>
              <Link href={cancelHref} className={buttonVariants({ variant: "secondary" })}>
                Cancel
              </Link>
              <div className="w-full sm:w-56">
                <Button type="button" className="w-full" onClick={(event) => goToReview(event.currentTarget.form)}>
                  Continue
                  <ArrowRight aria-hidden />
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                <ArrowLeft aria-hidden />
                Back
              </Button>
              <div className="w-full sm:w-56">
                <SubmitButton pending={pending} label="Create campaign" pendingLabel="Creating" />
              </div>
            </>
          ),
      }}
    >
      <Steps step={step} setStep={setStep} tab={tab} setTab={setTab} choices={choices} snapshot={snapshot} missing={missing} initial={initial} />
    </ActionForm>
  );
}
