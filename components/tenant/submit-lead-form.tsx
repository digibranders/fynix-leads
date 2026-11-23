"use client";

import { CircleNotch, PaperPlaneRight, Plus, Trash, WarningCircle } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { DateTimeField } from "@/components/ui/date-time";
import { IDLE_TENANT_ACTION } from "@/lib/tenant/action-state";
import { submitLeadAction } from "@/server/domain/lead-actions";
import { NATIVE_FIELD, NATIVE_TEXTAREA } from "./field-classes";

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

interface Props {
  readonly campaigns: readonly CampaignOption[];
  readonly aliases: readonly AliasOption[];
  readonly hosts: readonly HostOption[];
}

/** Today as "YYYY-MM-DD" on this device: a meeting cannot be proposed for a day that has gone. */
function earliestDay(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function SubmitLeadForm({ campaigns, aliases, hosts }: Props) {
  const [state, formAction, pending] = useActionState(submitLeadAction, IDLE_TENANT_ACTION);
  const [times, setTimes] = useState<string[]>([""]);
  const [campaignId, setCampaignId] = useState("");
  const brand = campaigns.find((c) => c.id === campaignId)?.clientBrandName.trim().toLowerCase();
  // An alias fronts one client's brand and a host belongs to one campaign, so the lists follow the campaign chosen.
  const campaignAliases = brand === undefined ? [] : aliases.filter((a) => a.clientBrandName.trim().toLowerCase() === brand);
  const campaignHosts = hosts.filter((h) => h.campaignId === campaignId);

  const addTimeSlot = () => {
    if (times.length < 3) {
      setTimes([...times, ""]);
    }
  };

  const removeTimeSlot = (index: number) => {
    if (times.length > 1) {
      setTimes(times.filter((_, i) => i !== index));
    }
  };

  const updateTimeSlot = (index: number, value: string) => {
    const updated = [...times];
    updated[index] = value;
    setTimes(updated);
  };

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6 max-w-3xl">
      {state.status === "error" && (
        <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-destructive flex items-center gap-2">
          <WarningCircle aria-hidden size={18} weight="fill" className="shrink-0" />
          <p className="text-sm font-medium">{state.message ?? "Could not submit lead."}</p>
        </div>
      )}

      {state.status === "success" && (
        <div role="status" className="rounded-md border border-emerald-500/20 bg-emerald-50 p-4 text-emerald-800">
          <p className="text-sm font-medium">{state.message}</p>
        </div>
      )}

      <div className="rounded-lg bg-surface p-6 shadow-raised flex flex-col gap-4">
        <h2 className="text-section font-semibold">1. Campaign & Sender Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="lead-campaign" className="text-xs font-semibold text-ink-2">
              Campaign <span className="text-destructive">*</span>
            </label>
            <Choice
              id="lead-campaign"
              name="campaignId"
              value={campaignId}
              onValueChange={setCampaignId}
              required
              placeholder="Select campaign"
              emptyLabel="No campaigns are assigned to you yet"
              options={campaigns.map((c) => ({ value: c.id, label: `${c.name} (${c.clientBrandName})` }))}
            />
          </div>

          <div>
            <label htmlFor="lead-alias" className="text-xs font-semibold text-ink-2">
              Client Brand Alias <span className="text-destructive">*</span>
            </label>
            <Choice
              id="lead-alias"
              name="aliasIdentityId"
              required
              placeholder="Select verified alias"
              emptyLabel={campaignId === "" ? "Choose a campaign first" : "No verified alias for this client yet"}
              options={campaignAliases.map((a) => ({ value: a.id, label: `${a.displayName}, ${a.clientBrandName} (${a.aliasEmail})` }))}
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="lead-host" className="text-xs font-semibold text-ink-2">
              Meeting Host <span className="text-destructive">*</span>
            </label>
            <Choice
              id="lead-host"
              name="hostMemberId"
              required
              placeholder="Select host"
              emptyLabel={campaignId === "" ? "Choose a campaign first" : "No hosts for this campaign yet"}
              options={campaignHosts.map((h) => ({ value: h.id, label: h.name.includes(h.jobTitle) ? h.name : `${h.name} (${h.jobTitle})` }))}
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-surface p-6 shadow-raised flex flex-col gap-4">
        <h2 className="text-section font-semibold">2. Prospect Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="prospect-name" className="text-xs font-semibold text-ink-2">
              Full Name <span className="text-destructive">*</span>
            </label>
            <input
              id="prospect-name"
              name="prospectName"
              type="text"
              required
              className={NATIVE_FIELD}
            />
          </div>

          <div>
            <label htmlFor="prospect-title" className="text-xs font-semibold text-ink-2">
              Job Title <span className="text-destructive">*</span>
            </label>
            <input
              id="prospect-title"
              name="prospectTitle"
              type="text"
              required
              className={NATIVE_FIELD}
            />
          </div>

          <div>
            <label htmlFor="prospect-company" className="text-xs font-semibold text-ink-2">
              Company Name <span className="text-destructive">*</span>
            </label>
            <input
              id="prospect-company"
              name="prospectCompany"
              type="text"
              required
              className={NATIVE_FIELD}
            />
          </div>

          <div>
            <label htmlFor="prospect-domain" className="text-xs font-semibold text-ink-2">
              Company Domain <span className="text-destructive">*</span>
            </label>
            <input
              id="prospect-domain"
              name="prospectDomain"
              type="text"
              required
              placeholder="example.com"
              className={NATIVE_FIELD}
            />
          </div>

          <div>
            <label htmlFor="prospect-email" className="text-xs font-semibold text-ink-2">
              Work Email <span className="text-destructive">*</span>
            </label>
            <input
              id="prospect-email"
              name="prospectEmail"
              type="email"
              required
              className={NATIVE_FIELD}
            />
          </div>

          <div>
            <label htmlFor="prospect-phone" className="text-xs font-semibold text-ink-2">
              Phone Number
            </label>
            <input
              id="prospect-phone"
              name="prospectPhone"
              type="tel"
              className={NATIVE_FIELD}
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="prospect-linkedin" className="text-xs font-semibold text-ink-2">
              LinkedIn Profile URL <span className="text-destructive">*</span>
            </label>
            <input
              id="prospect-linkedin"
              name="prospectLinkedinUrl"
              type="url"
              required
              placeholder="https://linkedin.com/in/prospect"
              className={NATIVE_FIELD}
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="prospect-notes" className="text-xs font-semibold text-ink-2">
              Outreach Context & Notes
            </label>
            <textarea
              id="prospect-notes"
              name="prospectNotes"
              rows={2}
              className={NATIVE_TEXTAREA}
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-surface p-6 shadow-raised flex flex-col gap-4">
        <h2 className="text-section font-semibold">3. BANT Qualification</h2>
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="bant-budget" className="text-xs font-semibold text-ink-2">
              Budget Qualification <span className="text-destructive">*</span>
            </label>
            <input
              id="bant-budget"
              name="bantBudget"
              type="text"
              required
              placeholder="Confirmed budget or spend bracket"
              className={NATIVE_FIELD}
            />
          </div>

          <div>
            <label htmlFor="bant-authority" className="text-xs font-semibold text-ink-2">
              Authority Qualification <span className="text-destructive">*</span>
            </label>
            <input
              id="bant-authority"
              name="bantAuthority"
              type="text"
              required
              placeholder="Role in procurement or signing authority"
              className={NATIVE_FIELD}
            />
          </div>

          <div>
            <label htmlFor="bant-need" className="text-xs font-semibold text-ink-2">
              Need Qualification <span className="text-destructive">*</span>
            </label>
            <input
              id="bant-need"
              name="bantNeed"
              type="text"
              required
              placeholder="Pain point or active evaluation"
              className={NATIVE_FIELD}
            />
          </div>

          <div>
            <label htmlFor="bant-timeline" className="text-xs font-semibold text-ink-2">
              Timeline Qualification <span className="text-destructive">*</span>
            </label>
            <input
              id="bant-timeline"
              name="bantTimeline"
              type="text"
              required
              placeholder="e.g. Q1 rollout, starting next month"
              className={NATIVE_FIELD}
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-surface p-6 shadow-raised flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-section font-semibold">4. Proposed Meeting Times (1 to 3)</h2>
          {times.length < 3 && (
            <Button type="button" variant="secondary" size="sm" onClick={addTimeSlot} className="gap-1">
              <Plus aria-hidden />
              <span>Add Option</span>
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {times.map((time, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <DateTimeField value={time} min={earliestDay()} onChange={(next) => updateTimeSlot(idx, next)} aria-label={`Proposed time ${idx + 1}`} />
              {/* Hidden input converts local time to ISO with Z for the server schema */}
              <input
                type="hidden"
                name="proposedTimes"
                value={time ? new Date(time).toISOString() : ""}
              />
              {times.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeTimeSlot(idx)}
                  aria-label="Remove time slot"
                >
                  <Trash aria-hidden />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <Button
          type="submit"
          variant="default"
          size="default"
          disabled={pending}
          aria-busy={pending}
          className="gap-2"
        >
          {pending ? (
            <CircleNotch aria-hidden className="motion-safe:animate-spin" />
          ) : (
            <PaperPlaneRight aria-hidden weight="bold" />
          )}
          <span>Submit Qualified Lead</span>
        </Button>
      </div>
    </form>
  );
}
