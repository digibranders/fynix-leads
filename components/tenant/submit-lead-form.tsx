"use client";

import { CircleNotch, PaperPlaneRight, Plus, Trash, WarningCircle } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { IDLE_TENANT_ACTION, submitLeadAction } from "@/server/domain/lead-actions";
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
  readonly name: string;
  readonly jobTitle: string;
}

interface Props {
  readonly campaigns: readonly CampaignOption[];
  readonly aliases: readonly AliasOption[];
  readonly hosts: readonly HostOption[];
}

export function SubmitLeadForm({ campaigns, aliases, hosts }: Props) {
  const [state, formAction, pending] = useActionState(submitLeadAction, IDLE_TENANT_ACTION);
  const [times, setTimes] = useState<string[]>([""]);

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
    <form action={formAction} className="flex flex-col gap-6 max-w-3xl">
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
            <select
              id="lead-campaign"
              name="campaignId"
              required
              className={NATIVE_FIELD}
            >
              <option value="">Select campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.clientBrandName})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="lead-alias" className="text-xs font-semibold text-ink-2">
              Client Brand Alias <span className="text-destructive">*</span>
            </label>
            <select
              id="lead-alias"
              name="aliasIdentityId"
              required
              className={NATIVE_FIELD}
            >
              <option value="">Select verified alias</option>
              {aliases.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName} - {a.clientBrandName} ({a.aliasEmail})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="lead-host" className="text-xs font-semibold text-ink-2">
              Meeting Host <span className="text-destructive">*</span>
            </label>
            <select
              id="lead-host"
              name="hostMemberId"
              required
              className={NATIVE_FIELD}
            >
              <option value="">Select host</option>
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} ({h.jobTitle})
                </option>
              ))}
            </select>
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
              <input
                type="datetime-local"
                required
                value={time}
                onChange={(e) => updateTimeSlot(idx, e.target.value)}
                className={NATIVE_FIELD}
              />
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
