"use server";

import type { FormState } from "@/lib/fynix/form-state";
import { fynixAnswerForClient, fynixApproveOverShare, fynixCorrectLead, fynixMarkLost } from "@/server/domain/fynix-lead-actions";
import { calendarSetupFromEnv } from "@/server/calendar";
import { assertLiveFreeForFynix } from "@/server/calendar/live-check";
import { campaignOfLeadForFynix, fynixRebookMeeting } from "@/server/domain/meeting-invitations";
import { fynixDecideContest } from "@/server/domain/contests";
import { rebookMeetingSchema, answerForClientSchema, approveOverShareSchema, correctLeadSchema, decideContestSchema, markLostSchema, markRejectionReviewedSchema } from "@/server/domain/inputs";
import { markRejectionReviewed } from "@/server/domain/rejection-reviews";
import { field, runAction } from "@/server/fynix/run-action";

/**
 * The forms of Fynix acting on a lead: correct it, answer for the client, mark it lost, clear a beyond-a-share flag, decide a contest and mark a
 * rejection reviewed. Each needs a note and the domain audits it. Thin shells over `runAction`; this file exports only actions.
 */

const REFUSALS = { "invalid-lead-stage": "This lead has moved on since you opened it. Refresh the page.", "not-found": "That lead is no longer available. Refresh the page." } as const;

export async function decideContestAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: ["outcome", "note"],
    build: () => ({ leadId: field(formData, "leadId"), outcome: field(formData, "outcome"), note: field(formData, "note") }),
    schema: decideContestSchema,
    labels: { outcome: "Final outcome", note: "Note" },
    messages: REFUSALS,
    perform: async (deps, actor, input) => {
      const parsed = decideContestSchema.parse(input);
      await fynixDecideContest(deps, actor, parsed.leadId, parsed.outcome, parsed.note);
    },
  });
}

export async function markRejectionReviewedAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const note = field(formData, "note").trim();
  return runAction({
    formData,
    fieldNames: ["note"],
    build: () => ({ leadId: field(formData, "leadId"), ...(note === "" ? {} : { note }) }),
    schema: markRejectionReviewedSchema,
    labels: { note: "Note" },
    messages: REFUSALS,
    perform: async (deps, actor, input) => {
      const parsed = markRejectionReviewedSchema.parse(input);
      await markRejectionReviewed(deps, actor, parsed.leadId, parsed.note);
    },
  });
}

const CORRECTABLE = ["prospectName", "prospectTitle", "prospectCompany", "prospectDomain", "prospectLinkedinUrl", "prospectEmail", "prospectPhone", "prospectNotes", "bantBudget", "bantAuthority", "bantNeed", "bantTimeline"] as const;

/** Only the fields that differ from what the lead holds are sent, so the schema's "must change something" check means what it says. */
export async function correctLeadAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const changed: Record<string, string> = {};
  for (const name of CORRECTABLE) {
    const value = field(formData, name).trim();
    if (value !== field(formData, `was_${name}`).trim()) changed[name] = value;
  }
  return runAction({
    formData,
    fieldNames: [...CORRECTABLE, "note"],
    build: () => ({ leadId: field(formData, "leadId"), note: field(formData, "note"), ...changed }),
    schema: correctLeadSchema,
    labels: { note: "Note", prospectName: "Name", prospectTitle: "Job title", prospectCompany: "Company", prospectDomain: "Website", prospectLinkedinUrl: "LinkedIn", prospectEmail: "Email", prospectPhone: "Phone", prospectNotes: "Notes", bantBudget: "Budget", bantAuthority: "Authority", bantNeed: "Need", bantTimeline: "Timeline" },
    messages: { ...REFUSALS, "invalid-input": "Change at least one detail." },
    perform: async (deps, actor, input) => {
      await fynixCorrectLead(deps, actor, input);
    },
  });
}

export async function answerForClientAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const time = field(formData, "selectedMeetingTime");
  return runAction({
    formData,
    fieldNames: ["answer", "note"],
    build: () => ({ leadId: field(formData, "leadId"), answer: field(formData, "answer"), note: field(formData, "note"), ...(time === "" ? {} : { selectedMeetingTime: time }) }),
    schema: answerForClientSchema,
    labels: { answer: "Answer", note: "Note", selectedMeetingTime: "Time" },
    messages: { ...REFUSALS, "invalid-input": "Choose one of the times the lead proposed." },
    perform: async (deps, actor, input) => {
      await fynixAnswerForClient(deps, actor, input);
    },
  });
}

export async function markLostAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: ["note"],
    build: () => ({ leadId: field(formData, "leadId"), note: field(formData, "note") }),
    schema: markLostSchema,
    labels: { note: "Note" },
    messages: REFUSALS,
    perform: async (deps, actor, input) => {
      await fynixMarkLost(deps, actor, input);
    },
  });
}

export async function clearOverShareAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: ["note"],
    build: () => ({ leadId: field(formData, "leadId"), note: field(formData, "note") }),
    schema: approveOverShareSchema,
    labels: { note: "Note" },
    messages: { ...REFUSALS, "invalid-input": "This lead is not beyond a share any more. Refresh the page." },
    perform: async (deps, actor, input) => {
      await fynixApproveOverShare(deps, actor, input);
    },
  });
}

/** Fynix books a new time for a meeting that has to move or that nobody could take, and invites the people free then. Admin and staff; the domain audits it. */
export async function fynixBookNewTimeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: [],
    build: () => ({
      leadId: field(formData, "leadId"),
      slot: field(formData, "proposedTimes"),
      inviteeMemberIds: formData.getAll("inviteeMemberIds").filter((id): id is string => typeof id === "string" && id !== ""),
    }),
    schema: rebookMeetingSchema,
    labels: { leadId: "Lead", slot: "Time", inviteeMemberIds: "People to invite" },
    messages: { ...REFUSALS, "invalid-input": "Pick a time at least 48 hours away, when everyone you invite is free.", "invalid-transition": "This meeting can no longer be moved. Refresh the page." },
    perform: async (deps, actor, input) => {
      const parsed = rebookMeetingSchema.parse(input);
      const setup = calendarSetupFromEnv();
      if (setup !== null) {
        const campaignId = await campaignOfLeadForFynix(deps, actor, parsed.leadId);
        if (campaignId !== null) await assertLiveFreeForFynix({ authDb: deps.authDb, setup }, deps, actor, { campaignId, memberIds: parsed.inviteeMemberIds, slot: parsed.slot });
      }
      await fynixRebookMeeting(deps, actor, input);
    },
  });
}
