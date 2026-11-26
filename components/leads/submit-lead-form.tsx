"use client";

import Link from "next/link";
import { CheckCircle, CircleNotch, FloppyDisk, PaperPlaneRight, WarningCircle } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { Panel, Tonal } from "@/components/kit/panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SlotPicker } from "@/components/leads/slot-picker";
import type { CalendarPersonLike } from "@/lib/calendar/layout";
import { IDLE_DRAFT_ACTION, IDLE_TENANT_ACTION } from "@/lib/tenant/action-state";
import { saveDraftAction } from "@/server/domain/draft-actions";
import { submitLeadAction } from "@/server/domain/lead-actions";

export interface CampaignOption {
  readonly id: string;
  readonly name: string;
  readonly clientOrgId: string;
  readonly clientName: string;
}

export interface AliasOption {
  readonly id: string;
  readonly displayName: string;
  readonly clientOrgId: string | null;
  readonly clientName: string;
  readonly aliasEmail: string;
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
  readonly proposedTimes: readonly string[];
}

interface Props {
  readonly campaigns: readonly CampaignOption[];
  readonly aliases: readonly AliasOption[];
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

/** A lead submission: four tonal groups of fields in one panel, and one primary action in a sticky foot. Field names are the ones the action reads. */
export function SubmitLeadForm({ campaigns, aliases, notLive = [], leadsHref, teams = {}, draft = null }: Props) {
  const [state, formAction, pending] = useActionState(submitLeadAction, IDLE_TENANT_ACTION);
  const [draftState, draftAction, draftPending] = useActionState(saveDraftAction, IDLE_DRAFT_ACTION);
  const [campaignId, setCampaignId] = useState(draft?.campaignId ?? "");
  // The first save of a new draft answers with its id, so the next save and the final send both work on that draft.
  const draftId = draftState.leadId ?? draft?.id ?? "";
  const clientOrgId = campaigns.find((c) => c.id === campaignId)?.clientOrgId;
  // An alias fronts one client, so the list follows the campaign chosen.
  const campaignAliases = clientOrgId === undefined ? [] : aliases.filter((a) => a.clientOrgId === clientOrgId);

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="draftId" value={draftId} />
      <Panel className="overflow-visible">
        <div className="flex flex-col gap-3 p-3 md:p-4">
          {draftState.status === "error" ? (
            <p role="alert" className="flex items-start gap-2 rounded-md bg-red-soft px-4 py-3 text-body text-red-text">
              <WarningCircle aria-hidden size={18} weight="fill" className="mt-0.5 shrink-0" />
              <span>{draftState.message ?? "Could not save the draft."}</span>
            </p>
          ) : null}
          {draftState.status === "success" ? (
            <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-green-soft px-4 py-3 text-body text-green-text">
              <CheckCircle aria-hidden size={18} weight="fill" className="shrink-0" />
              <span>{draftState.message}</span>
              <Link href={`${leadsHref}?show=drafts`} className="font-semibold underline underline-offset-2">
                View your drafts
              </Link>
            </p>
          ) : null}
          {state.status === "error" ? (
            <p role="alert" className="flex items-start gap-2 rounded-md bg-red-soft px-4 py-3 text-body text-red-text">
              <WarningCircle aria-hidden size={18} weight="fill" className="mt-0.5 shrink-0" />
              <span>{state.message ?? "Could not submit the lead."}</span>
            </p>
          ) : null}
          {state.status === "success" ? (
            <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-green-soft px-4 py-3 text-body text-green-text">
              <CheckCircle aria-hidden size={18} weight="fill" className="shrink-0" />
              <span>{state.message}</span>
              <Link href={leadsHref} className="font-semibold underline underline-offset-2">
                View your leads
              </Link>
            </p>
          ) : null}

          <Group title="Campaign and sender" note="The campaign sets which alias you can choose.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
              <Field id="lead-alias" label="Client alias">
                <Choice
                  key={`alias-${campaignId}`}
                  id="lead-alias"
                  name="aliasIdentityId"
                  defaultValue={campaignId === draft?.campaignId ? (draft?.aliasIdentityId ?? "") : ""}
                  required
                  placeholder="Select a verified alias"
                  emptyLabel={campaignId === "" ? "Choose a campaign first" : "No verified alias for this client yet"}
                  options={campaignAliases.map((a) => ({ value: a.id, label: `${a.displayName}, ${a.clientName} (${a.aliasEmail})` }))}
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

          <Group title="Qualification" note="Budget, authority, need and timeline, as the prospect confirmed them.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field id="bant-budget" label="Budget">
                <Input id="bant-budget" name="bantBudget" defaultValue={draft?.bantBudget} type="text" required placeholder="Confirmed budget or spend bracket" />
              </Field>
              <Field id="bant-authority" label="Authority">
                <Input id="bant-authority" name="bantAuthority" defaultValue={draft?.bantAuthority} type="text" required placeholder="Role in buying or signing" />
              </Field>
              <Field id="bant-need" label="Need">
                <Input id="bant-need" name="bantNeed" defaultValue={draft?.bantNeed} type="text" required placeholder="Pain point or active evaluation" />
              </Field>
              <Field id="bant-timeline" label="Timeline">
                <Input id="bant-timeline" name="bantTimeline" defaultValue={draft?.bantTimeline} type="text" required placeholder="For example Q1 rollout" />
              </Field>
            </div>
          </Group>

          <Group title="Meeting time" note="Pick one time when someone from the client team is free, and who to invite. The first to accept takes it.">
            {campaignId === "" ? (
              <p className="text-label text-ink-muted">Choose a campaign to see when its client team is free.</p>
            ) : (
              <SlotPicker key={campaignId} people={teams[campaignId] ?? []} initialTime={campaignId === draft?.campaignId ? (draft?.proposedTimes[0] ?? null) : null} />
            )}
          </Group>
        </div>

        <div className="sticky bottom-(--tabbar-stack) z-10 flex flex-wrap items-center justify-between gap-3 rounded-b-lg bg-surface max-md:rounded-lg max-md:shadow-raised md:bottom-0 px-5 py-3.5 shadow-[0_-1px_0_var(--line)]">
          <Link href={leadsHref} className={buttonVariants({ variant: "ghost" })}>
            Cancel
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="secondary" size="lg" formAction={draftAction} disabled={draftPending || pending} aria-busy={draftPending}>
              {draftPending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : <FloppyDisk aria-hidden weight="bold" />}
              Save draft
            </Button>
            <Button type="submit" size="lg" disabled={pending || draftPending} aria-busy={pending}>
              {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : <PaperPlaneRight aria-hidden weight="bold" />}
              Submit lead
            </Button>
          </div>
        </div>
      </Panel>
    </form>
  );
}
