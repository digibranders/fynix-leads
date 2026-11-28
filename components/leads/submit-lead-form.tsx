"use client";

import Link from "next/link";
import { CheckCircle, CircleNotch, FloppyDisk, PaperPlaneRight, WarningCircle } from "@phosphor-icons/react";
import { useActionState, useLayoutEffect, useRef, useState } from "react";
import { Panel, Tonal } from "@/components/kit/panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QualificationChecklist } from "@/components/leads/qualification-checklist";
import { SlotPicker } from "@/components/leads/slot-picker";
import type { QualificationCheck } from "@/lib/qualification-checks";
import type { CalendarPersonLike } from "@/lib/calendar/layout";
import { restoreTextValues, textValues, type FieldValues } from "@/lib/leads/form-values";
import { NO_SLOT, leadIsReady, leadMissing, requiredTexts, type ChosenSlot, type RequiredTexts } from "@/lib/leads/submit-readiness";
import { IDLE_DRAFT_ACTION, IDLE_TENANT_ACTION } from "@/lib/tenant/action-state";
import { saveDraftAction } from "@/server/domain/draft-actions";
import { submitLeadAction } from "@/server/domain/lead-actions";

export interface CampaignOption {
  readonly id: string;
  readonly name: string;
  readonly clientOrgId: string;
  readonly clientName: string;
  /** The checks the campaign asks for: its qualification criteria and qualifying questions. */
  readonly checklist: readonly QualificationCheck[];
}

export interface NotLiveCampaign {
  readonly campaignId: string;
  readonly name: string;
  readonly reason: string;
}

/** A draft the form is opened from (`?draft=`): every field it holds, so the form starts where the person left off. */
export interface DraftPrefill {
  readonly id: string;
  readonly campaignId: string;
  readonly aliasIdentityId: string | null;
  readonly hostMemberId: string | null;
  readonly prospectName: string;
  readonly prospectTitle: string;
  readonly prospectCompany: string;
  readonly prospectDomain: string;
  readonly prospectLinkedinUrl: string;
  readonly prospectEmail: string;
  readonly prospectPhone: string | null;
  readonly prospectNotes: string | null;
  readonly bantBudget: string;
  readonly bantAuthority: string;
  readonly bantNeed: string;
  readonly bantTimeline: string;
  readonly qualificationChecks: readonly QualificationCheck[];
  readonly qualificationNotes: string;
  readonly proposedTimes: readonly string[];
}

interface Props {
  readonly campaigns: readonly CampaignOption[];
  /** Campaigns that take no leads, each with the reason in words that name no person. */
  readonly notLive?: readonly NotLiveCampaign[];
  /** Where the leads of this portal are listed, for the link after a lead is sent. */
  readonly leadsHref: string;
  /** The client team of each campaign with their hours and busy time, by campaign id: the free times and the people to invite come from it. */
  readonly teams?: Readonly<Record<string, readonly CalendarPersonLike[]>>;
  /** A draft to continue. */
  readonly draft?: DraftPrefill | null;
}

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <Tonal className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="text-section font-semibold">{title}</h2>
        {note ? <p className="mt-0.5 text-label text-ink-muted">{note}</p> : null}
      </div>
      {children}
    </Tonal>
  );
}

/** The campaign's checks, with the tick and the answer each one had in a draft when it asked for the same thing. */
function withDraftTicks(asked: readonly QualificationCheck[], saved: readonly QualificationCheck[]): QualificationCheck[] {
  return asked.map((check) => {
    const old = saved.find((entry) => entry.kind === check.kind && entry.label === check.label);
    // A check the draft already had keeps its tick and the answer written; a new one starts as the campaign asks (a question as meeting the expectation, a criterion unticked).
    return old === undefined ? check : { ...check, passed: old.passed, answer: old.answer ?? check.answer ?? "" };
  });
}

/** A lead submission: four tonal groups of fields in one panel, and one primary action in a sticky foot. Field names are the ones the action reads. */
export function SubmitLeadForm({ campaigns, notLive = [], leadsHref, teams = {}, draft = null }: Props) {
  const [state, formAction, pending] = useActionState(submitLeadAction, IDLE_TENANT_ACTION);
  const [draftState, draftAction, draftPending] = useActionState(saveDraftAction, IDLE_DRAFT_ACTION);
  const [campaignId, setCampaignId] = useState(draft?.campaignId ?? "");
  // The ticks, one set for the campaign chosen. They start unticked, or as the draft had them (a check of the draft that the campaign still asks for keeps its tick).
  const [ticks, setTicks] = useState<{ readonly campaignId: string; readonly checks: readonly QualificationCheck[] }>(() => ({ campaignId: draft?.campaignId ?? "", checks: withDraftTicks(campaigns.find((c) => c.id === draft?.campaignId)?.checklist ?? [], draft?.qualificationChecks ?? []) }));
  const checklist = ticks.campaignId === campaignId ? ticks.checks : withDraftTicks(campaigns.find((c) => c.id === campaignId)?.checklist ?? [], []);
  // React clears the text fields when an action ends. The text is kept as it was sent and put back after an error and after a draft is saved, not after a lead is sent.
  const formRef = useRef<HTMLFormElement>(null);
  const kept = useRef<FieldValues>({});
  // What the send button needs to know: the required text as typed (read on every keystroke), and the time and people chosen in the meeting picker. The fields themselves stay as they are.
  const [texts, setTexts] = useState<RequiredTexts>(() => ({
    prospectName: draft?.prospectName ?? "",
    prospectTitle: draft?.prospectTitle ?? "",
    prospectCompany: draft?.prospectCompany ?? "",
    prospectDomain: draft?.prospectDomain ?? "",
    prospectEmail: draft?.prospectEmail ?? "",
    prospectLinkedinUrl: draft?.prospectLinkedinUrl ?? "",
  }));
  const [slot, setSlot] = useState<ChosenSlot>(NO_SLOT);
  const readiness = { campaignId, texts, slot, checks: checklist };
  const ready = leadIsReady(readiness);
  const missing = leadMissing(readiness);
  // Only the answer to the button pressed last is shown, so a draft that was saved does not sit under an old complaint about the send.
  const [lastPressed, setLastPressed] = useState<"send" | "draft" | null>(null);
  const remember = () => {
    if (formRef.current !== null) kept.current = textValues(formRef.current);
  };
  const submit = (formData: FormData) => {
    remember();
    setLastPressed("send");
    formAction(formData);
  };
  const saveDraft = (formData: FormData) => {
    remember();
    setLastPressed("draft");
    draftAction(formData);
  };
  useLayoutEffect(() => {
    if (state.status === "error" && formRef.current !== null) restoreTextValues(formRef.current, kept.current);
  }, [state]);
  useLayoutEffect(() => {
    if (draftState.status !== "idle" && formRef.current !== null) restoreTextValues(formRef.current, kept.current);
  }, [draftState]);
  // After an action ends the fields hold what React left (cleared after a send, put back after an error or a draft), so the send button reads them again.
  useLayoutEffect(() => {
    setTexts(requiredTexts(formRef.current));
  }, [state, draftState]);
  // The first save of a new draft answers with its id, so the next save and the final send both work on that draft.
  const draftId = draftState.leadId ?? draft?.id ?? "";

  return (
    <form ref={formRef} action={submit} onInput={() => setTexts(requiredTexts(formRef.current))} noValidate>
      <input type="hidden" name="draftId" value={draftId} />
      <Panel className="overflow-visible">
        <div className="flex flex-col gap-3 p-3 md:p-4">
          {lastPressed === "draft" && draftState.status === "error" ? (
            <p role="alert" className="flex items-start gap-2 rounded-md bg-red-soft px-4 py-3 text-body text-red-text">
              <WarningCircle aria-hidden size={18} weight="fill" className="mt-0.5 shrink-0" />
              <span>{draftState.message ?? "Could not save the draft."}</span>
            </p>
          ) : null}
          {lastPressed === "draft" && draftState.status === "success" ? (
            <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-green-soft px-4 py-3 text-body text-green-text">
              <CheckCircle aria-hidden size={18} weight="fill" className="shrink-0" />
              <span>{draftState.message}</span>
              <Link href={`${leadsHref}?show=drafts`} className="font-semibold underline underline-offset-2">
                View your drafts
              </Link>
            </p>
          ) : null}
          {lastPressed === "send" && state.status === "error" ? (
            <p role="alert" className="flex items-start gap-2 rounded-md bg-red-soft px-4 py-3 text-body text-red-text">
              <WarningCircle aria-hidden size={18} weight="fill" className="mt-0.5 shrink-0" />
              <span>{state.message ?? "Could not submit the lead."}</span>
            </p>
          ) : null}
          {lastPressed === "send" && state.status === "success" ? (
            <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-green-soft px-4 py-3 text-body text-green-text">
              <CheckCircle aria-hidden size={18} weight="fill" className="shrink-0" />
              <span>{state.message}</span>
              <Link href={leadsHref} className="font-semibold underline underline-offset-2">
                View your leads
              </Link>
            </p>
          ) : null}

          <Group title="Campaign" note="The client sees the lead under their own name.">
            <div className="grid grid-cols-1 gap-4">
              <Field id="lead-campaign" label="Campaign">
                <Choice
                  id="lead-campaign"
                  name="campaignId"
                  value={campaignId}
                  onValueChange={setCampaignId}
                  disabled={draftId !== ""}
                  required
                  placeholder="Select a campaign"
                  emptyLabel={notLive.length > 0 ? "No campaign is live yet" : "No campaigns are assigned to you yet"}
                  options={campaigns.map((c) => ({ value: c.id, label: `${c.name} (${c.clientName})` }))}
                />
              </Field>
            </div>
            {notLive.length > 0 ? (
              <ul aria-label="Campaigns that are not live" className="flex flex-col gap-1.5 text-table text-ink-2">
                {notLive.map((row) => (
                  <li key={row.campaignId}>
                    <span className="font-semibold text-ink">{row.name}</span>. Not live yet: {row.reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </Group>

          <Group title="Prospect">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field id="prospect-name" label="Full name">
                <Input id="prospect-name" name="prospectName" defaultValue={draft?.prospectName} type="text" required autoComplete="off" />
              </Field>
              <Field id="prospect-title" label="Job title">
                <Input id="prospect-title" name="prospectTitle" defaultValue={draft?.prospectTitle} type="text" required autoComplete="off" />
              </Field>
              <Field id="prospect-company" label="Company name">
                <Input id="prospect-company" name="prospectCompany" defaultValue={draft?.prospectCompany} type="text" required autoComplete="off" />
              </Field>
              <Field id="prospect-domain" label="Company domain">
                <Input id="prospect-domain" name="prospectDomain" defaultValue={draft?.prospectDomain} type="text" required placeholder="example.com" autoComplete="off" />
              </Field>
              <Field id="prospect-email" label="Work email">
                <Input id="prospect-email" name="prospectEmail" defaultValue={draft?.prospectEmail} type="email" required autoComplete="off" />
              </Field>
              <Field id="prospect-phone" label="Phone number" helper="Optional">
                <Input id="prospect-phone" name="prospectPhone" defaultValue={draft?.prospectPhone ?? undefined} type="tel" autoComplete="off" />
              </Field>
              <div className="md:col-span-2">
                <Field id="prospect-linkedin" label="LinkedIn profile URL">
                  <Input id="prospect-linkedin" name="prospectLinkedinUrl" defaultValue={draft?.prospectLinkedinUrl} type="url" required placeholder="https://linkedin.com/in/prospect" autoComplete="off" />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field id="prospect-notes" label="Outreach context and notes" helper="Optional. What you said and what they replied.">
                  <Textarea id="prospect-notes" name="prospectNotes" rows={3} defaultValue={draft?.prospectNotes ?? undefined} />
                </Field>
              </div>
            </div>
          </Group>

          <Group title="Qualification checklist" note="Tick each check the prospect passed. Answer each question, and say why for any criterion not passed. The lead can still be sent.">
            {campaignId === "" ? <p className="text-label text-ink-muted">Choose a campaign to see its checks.</p> : <QualificationChecklist checks={checklist} onChange={(next) => setTicks({ campaignId, checks: next })} notesDefault={campaignId === draft?.campaignId ? draft?.qualificationNotes : undefined} />}
          </Group>

          <Group title="Meeting time" note="Pick one time when someone from the client team is free, and who to invite. The first to accept takes it.">
            {campaignId === "" ? (
              <p className="text-label text-ink-muted">Choose a campaign to see when its client team is free.</p>
            ) : (
              <SlotPicker key={campaignId} onChange={setSlot} people={teams[campaignId] ?? []} initialTime={campaignId === draft?.campaignId ? (draft?.proposedTimes[0] ?? null) : null} />
            )}
          </Group>
        </div>

        <div className="sticky bottom-(--tabbar-stack) z-10 flex flex-wrap items-center justify-between gap-3 rounded-b-lg bg-surface max-md:rounded-lg max-md:shadow-raised md:bottom-0 px-5 py-3.5 shadow-[0_-1px_0_var(--line)]">
          {ready ? null : (
            <p role="status" className="w-full text-caption text-ink-muted">
              <span className="font-semibold text-ink-2">Still needed to send: </span>
              {missing.slice(0, 4).join(", ")}
              {missing.length > 4 ? ` and ${missing.length - 4} more` : ""}
            </p>
          )}
          <Link href={leadsHref} className={buttonVariants({ variant: "ghost" })}>
            Cancel
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="secondary" size="lg" formAction={saveDraft} disabled={draftPending || pending} aria-busy={draftPending}>
              {draftPending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : <FloppyDisk aria-hidden weight="bold" />}
              Save draft
            </Button>
            <Button type="submit" size="lg" disabled={pending || draftPending || !ready} aria-busy={pending}>
              {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : <PaperPlaneRight aria-hidden weight="bold" />}
              Submit lead
            </Button>
          </div>
        </div>
      </Panel>
    </form>
  );
}
