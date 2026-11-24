"use client";

import Link from "next/link";
import { CheckCircle, CircleNotch, PaperPlaneRight, Plus, Trash, WarningCircle } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { Panel, Tonal } from "@/components/kit/panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { DateTimeField } from "@/components/ui/date-time";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { IDLE_TENANT_ACTION } from "@/lib/tenant/action-state";
import { submitLeadAction } from "@/server/domain/lead-actions";

export interface CampaignOption {
  readonly id: string;
  readonly name: string;
  readonly clientBrandName: string;
}

export interface AliasOption {
  readonly id: string;
  readonly displayName: string;
  readonly clientBrandName: string;
  readonly aliasEmail: string;
}

export interface HostOption {
  readonly id: string;
  readonly campaignId: string;
  readonly name: string;
  readonly jobTitle: string;
}

export interface NotLiveCampaign {
  readonly campaignId: string;
  readonly name: string;
  readonly reason: string;
}

interface Props {
  readonly campaigns: readonly CampaignOption[];
  readonly aliases: readonly AliasOption[];
  readonly hosts: readonly HostOption[];
  /** Campaigns that take no leads, each with the reason in words that name no person. */
  readonly notLive?: readonly NotLiveCampaign[];
  /** Where the leads of this portal are listed, for the link after a lead is sent. */
  readonly leadsHref: string;
}

/** Today as "YYYY-MM-DD" on this device: a meeting cannot be proposed for a day that has gone. */
function earliestDay(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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
export function SubmitLeadForm({ campaigns, aliases, hosts, notLive = [], leadsHref }: Props) {
  const [state, formAction, pending] = useActionState(submitLeadAction, IDLE_TENANT_ACTION);
  const [times, setTimes] = useState<string[]>([""]);
  const [campaignId, setCampaignId] = useState("");
  const brand = campaigns.find((c) => c.id === campaignId)?.clientBrandName.trim().toLowerCase();
  // An alias fronts one client's brand and a host belongs to one campaign, so the lists follow the campaign chosen.
  const campaignAliases = brand === undefined ? [] : aliases.filter((a) => a.clientBrandName.trim().toLowerCase() === brand);
  const campaignHosts = hosts.filter((h) => h.campaignId === campaignId);

  return (
    <form action={formAction} noValidate>
      <Panel className="overflow-visible">
        <div className="flex flex-col gap-3 p-3 md:p-4">
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

          <Group title="Campaign and sender" note="The campaign sets which alias and which host you can choose.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field id="lead-campaign" label="Campaign">
                <Choice
                  id="lead-campaign"
                  name="campaignId"
                  value={campaignId}
                  onValueChange={setCampaignId}
                  required
                  placeholder="Select a campaign"
                  emptyLabel={notLive.length > 0 ? "No campaign is live yet" : "No campaigns are assigned to you yet"}
                  options={campaigns.map((c) => ({ value: c.id, label: `${c.name} (${c.clientBrandName})` }))}
                />
              </Field>
              <Field id="lead-alias" label="Client brand alias">
                <Choice
                  key={`alias-${campaignId}`}
                  id="lead-alias"
                  name="aliasIdentityId"
                  required
                  placeholder="Select a verified alias"
                  emptyLabel={campaignId === "" ? "Choose a campaign first" : "No verified alias for this client yet"}
                  options={campaignAliases.map((a) => ({ value: a.id, label: `${a.displayName}, ${a.clientBrandName} (${a.aliasEmail})` }))}
                />
              </Field>
              <div className="md:col-span-2">
                <Field id="lead-host" label="Meeting host">
                  <Choice
                    key={`host-${campaignId}`}
                    id="lead-host"
                    name="hostMemberId"
                    required
                    placeholder="Select a host"
                    emptyLabel={campaignId === "" ? "Choose a campaign first" : "No hosts for this campaign yet"}
                    options={campaignHosts.map((h) => ({ value: h.id, label: h.name.includes(h.jobTitle) ? h.name : `${h.name} (${h.jobTitle})` }))}
                  />
                </Field>
              </div>
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
                <Input id="prospect-name" name="prospectName" type="text" required autoComplete="off" />
              </Field>
              <Field id="prospect-title" label="Job title">
                <Input id="prospect-title" name="prospectTitle" type="text" required autoComplete="off" />
              </Field>
              <Field id="prospect-company" label="Company name">
                <Input id="prospect-company" name="prospectCompany" type="text" required autoComplete="off" />
              </Field>
              <Field id="prospect-domain" label="Company domain">
                <Input id="prospect-domain" name="prospectDomain" type="text" required placeholder="example.com" autoComplete="off" />
              </Field>
              <Field id="prospect-email" label="Work email">
                <Input id="prospect-email" name="prospectEmail" type="email" required autoComplete="off" />
              </Field>
              <Field id="prospect-phone" label="Phone number" helper="Optional">
                <Input id="prospect-phone" name="prospectPhone" type="tel" autoComplete="off" />
              </Field>
              <div className="md:col-span-2">
                <Field id="prospect-linkedin" label="LinkedIn profile URL">
                  <Input id="prospect-linkedin" name="prospectLinkedinUrl" type="url" required placeholder="https://linkedin.com/in/prospect" autoComplete="off" />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field id="prospect-notes" label="Outreach context and notes" helper="Optional. What you said and what they replied.">
                  <Textarea id="prospect-notes" name="prospectNotes" rows={3} />
                </Field>
              </div>
            </div>
          </Group>

          <Group title="Qualification" note="Budget, authority, need and timeline, as the prospect confirmed them.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field id="bant-budget" label="Budget">
                <Input id="bant-budget" name="bantBudget" type="text" required placeholder="Confirmed budget or spend bracket" />
              </Field>
              <Field id="bant-authority" label="Authority">
                <Input id="bant-authority" name="bantAuthority" type="text" required placeholder="Role in buying or signing" />
              </Field>
              <Field id="bant-need" label="Need">
                <Input id="bant-need" name="bantNeed" type="text" required placeholder="Pain point or active evaluation" />
              </Field>
              <Field id="bant-timeline" label="Timeline">
                <Input id="bant-timeline" name="bantTimeline" type="text" required placeholder="For example Q1 rollout" />
              </Field>
            </div>
          </Group>

          <Group title="Proposed meeting times" note="Offer one to three times. The client picks one.">
            <div className="flex flex-col gap-3">
              {times.map((time, index) => (
                <div key={index} className="flex items-center gap-2">
                  <DateTimeField value={time} min={earliestDay()} onChange={(next) => setTimes(times.map((t, i) => (i === index ? next : t)))} aria-label={`Proposed time ${index + 1}`} />
                  {/* The browser's local time becomes an ISO instant, the form the server schema reads. */}
                  <input type="hidden" name="proposedTimes" value={time ? new Date(time).toISOString() : ""} />
                  {times.length > 1 ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setTimes(times.filter((_, i) => i !== index))} aria-label={`Remove proposed time ${index + 1}`}>
                      <Trash aria-hidden />
                      <span className="max-sm:sr-only">Remove</span>
                    </Button>
                  ) : null}
                </div>
              ))}
              {times.length < 3 ? (
                <div>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setTimes([...times, ""])}>
                    <Plus aria-hidden weight="bold" />
                    Add another time
                  </Button>
                </div>
              ) : null}
            </div>
          </Group>
        </div>

        <div className="sticky bottom-(--tabbar-stack) z-10 flex flex-wrap items-center justify-between gap-3 rounded-b-lg bg-surface max-md:rounded-lg max-md:shadow-raised md:bottom-0 px-5 py-3.5 shadow-[0_-1px_0_var(--line)]">
          <Link href={leadsHref} className={buttonVariants({ variant: "ghost" })}>
            Cancel
          </Link>
          <Button type="submit" size="lg" disabled={pending} aria-busy={pending}>
            {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : <PaperPlaneRight aria-hidden weight="bold" />}
            Submit lead
          </Button>
        </div>
      </Panel>
    </form>
  );
}
