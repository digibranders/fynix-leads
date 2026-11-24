"use server";

import type { FormState } from "@/lib/fynix/form-state";
import { getDatabase } from "@/server/db/client";
import { getDomain } from "@/server/domain";
import type { TenantActor } from "@/server/domain/alias-identity";
import type { SessionContext } from "@/server/auth/session-context";
import { clientReviewLeadSchema, contestOutcomeSchema, decideLeadSchema, pickPostponementSchema, proposePostponementSchema, recordMeetingOutcomeSchema, requestRejectionReviewSchema, withdrawLeadSchema } from "@/server/domain/inputs";
import { clientReviewLead, decideLead } from "@/server/domain/leads";
import { contestOutcome } from "@/server/domain/contests";
import { withdrawLead } from "@/server/domain/lead-drafts";
import { recordMeetingOutcome } from "@/server/domain/meetings";
import { pickPostponement, proposePostponement } from "@/server/domain/postponement";
import { requestRejectionReview } from "@/server/domain/rejection-reviews";
import { field, runTenantForm } from "@/server/tenant/run-form";

/**
 * The forms of the lead flow for the client, the coordinator and the agencies: book a time, propose other times, reject, accept or reject after the
 * meeting, and record the outcome. Thin shells over `runTenantForm`; the domain functions hold every rule. They are public endpoints, so this file
 * exports only actions.
 */

const PAGES = ["/client", "/supplier", "/agency"] as const;

const STALE = { "invalid-lead-stage": "This lead has moved on since you opened it. Refresh the page.", "not-found": "That lead is no longer available. Refresh the page." } as const;

function actorOf(context: SessionContext): TenantActor {
  if (context.kind === "fynix") throw new Error("A Fynix person is not a tenant");
  return { userId: context.userId, orgId: context.orgId, orgKind: context.kind, role: context.memberRole };
}

const dbFor = (context: SessionContext) => getDatabase(context.role).db;

/** The client picks one of the proposed times. This books the meeting only; it does not accept the lead. */
export async function pickTimeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runTenantForm({
    formData,
    fieldNames: [],
    kinds: ["client"],
    build: () => ({ leadId: field(formData, "leadId"), action: "accept", selectedMeetingTime: field(formData, "selectedMeetingTime") }),
    schema: clientReviewLeadSchema,
    labels: { selectedMeetingTime: "Meeting time" },
    messages: STALE,
    perform: async (context, input) => {
      await clientReviewLead(dbFor(context), getDomain(), actorOf(context), input);
    },
    revalidate: PAGES,
  });
}

/** The client offers one to three other times. The lead stays in its queue until the client picks one of them. */
export async function proposeTimesAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const proposedTimes = formData.getAll("proposedTimes").filter((value): value is string => typeof value === "string" && value !== "");
  return runTenantForm({
    formData,
    fieldNames: [],
    kinds: ["client"],
    precheck: (): Readonly<Record<string, string>> => (proposedTimes.length === 0 ? { proposedTimes: "Choose at least one time." } : {}),
    build: () => ({ leadId: field(formData, "leadId"), action: "propose_times", proposedTimes }),
    schema: clientReviewLeadSchema,
    labels: { proposedTimes: "Times" },
    messages: STALE,
    perform: async (context, input) => {
      await clientReviewLead(dbFor(context), getDomain(), actorOf(context), input);
    },
    revalidate: PAGES,
  });
}

/** The client rejects a lead before its meeting, with a required note. It counts zero. */
export async function rejectLeadAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runTenantForm({
    formData,
    fieldNames: ["declineReason"],
    kinds: ["client"],
    build: () => ({ leadId: field(formData, "leadId"), action: "decline", declineReason: field(formData, "declineReason") }),
    schema: clientReviewLeadSchema,
    labels: { declineReason: "Note" },
    messages: { ...STALE, "invalid-lead-stage": "A lead can be rejected before its meeting only. Refresh the page." },
    perform: async (context, input) => {
      await clientReviewLead(dbFor(context), getDomain(), actorOf(context), input);
    },
    revalidate: PAGES,
  });
}

/** The client accepts or rejects a lead whose meeting was held, with a required note. `decision` is "accept" or "reject". */
export async function decideLeadAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runTenantForm({
    formData,
    fieldNames: ["note"],
    kinds: ["client"],
    build: () => ({ leadId: field(formData, "leadId"), decision: field(formData, "decision"), note: field(formData, "note") }),
    schema: decideLeadSchema,
    labels: { note: "Note", decision: "Answer" },
    messages: { ...STALE, "invalid-lead-stage": "This lead has been answered already. Refresh the page." },
    perform: async (context, input) => {
      await decideLead(dbFor(context), getDomain(), actorOf(context), input);
    },
    revalidate: PAGES,
  });
}

/** The client, the coordinator or an agency records how a meeting went. The first side to record sets it. */
export async function recordOutcomeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const notes = field(formData, "notes").trim();
  return runTenantForm({
    formData,
    fieldNames: ["outcome", "notes"],
    kinds: ["client", "agency"],
    build: () => ({ meetingId: field(formData, "meetingId"), outcome: field(formData, "outcome"), ...(notes === "" ? {} : { notes }) }),
    schema: recordMeetingOutcomeSchema,
    labels: { outcome: "Outcome", notes: "Notes" },
    messages: { ...STALE, "outcome-already-recorded": "Someone recorded this outcome already. Refresh the page." },
    perform: async (context, input) => {
      await recordMeetingOutcome(dbFor(context), getDomain(), actorOf(context), input);
    },
    revalidate: PAGES,
  });
}

/** The source organisation withdraws a lead before its meeting. The note is optional. */
export async function withdrawLeadAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const note = field(formData, "note").trim();
  return runTenantForm({
    formData,
    fieldNames: ["note"],
    kinds: ["agency"],
    build: () => ({ leadId: field(formData, "leadId"), ...(note === "" ? {} : { note }) }),
    schema: withdrawLeadSchema,
    labels: { note: "Note" },
    messages: { ...STALE, "invalid-lead-stage": "A lead can be withdrawn before its meeting only. Refresh the page." },
    perform: async (context, input) => {
      await withdrawLead(dbFor(context), getDomain(), actorOf(context), input);
    },
    revalidate: PAGES,
  });
}

/** Either side offers one to three new times for a booked meeting. The other side picks one. */
export async function proposePostponementAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const proposedTimes = formData.getAll("proposedTimes").filter((value): value is string => typeof value === "string" && value !== "");
  return runTenantForm({
    formData,
    fieldNames: [],
    kinds: ["client", "agency"],
    precheck: (): Readonly<Record<string, string>> => (proposedTimes.length === 0 ? { proposedTimes: "Choose at least one time." } : {}),
    build: () => ({ meetingId: field(formData, "meetingId"), proposedTimes }),
    schema: proposePostponementSchema,
    labels: { proposedTimes: "Times" },
    messages: { ...STALE, "invalid-lead-stage": "This meeting can no longer be moved. Refresh the page.", "invalid-input": "Choose times that are in the future and different from each other." },
    perform: async (context, input) => {
      await proposePostponement(dbFor(context), getDomain(), actorOf(context), input);
    },
    revalidate: PAGES,
  });
}

/** The other side picks one of the proposed times. The meeting moves and keeps its link. */
export async function pickPostponementAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runTenantForm({
    formData,
    fieldNames: [],
    kinds: ["client", "agency"],
    precheck: (): Readonly<Record<string, string>> => (field(formData, "pickedTime") === "" ? { pickedTime: "Choose one of the times." } : {}),
    build: () => ({ rescheduleId: field(formData, "rescheduleId"), pickedTime: field(formData, "pickedTime") }),
    schema: pickPostponementSchema,
    labels: { pickedTime: "Time" },
    messages: { ...STALE, "invalid-lead-stage": "These times were answered or replaced already. Refresh the page." },
    perform: async (context, input) => {
      await pickPostponement(dbFor(context), getDomain(), actorOf(context), input);
    },
    revalidate: PAGES,
  });
}

/** The side that did not record an outcome contests it within 48 hours, with a note. Fynix decides. */
export async function contestOutcomeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runTenantForm({
    formData,
    fieldNames: ["note"],
    kinds: ["client", "agency"],
    build: () => ({ meetingId: field(formData, "meetingId"), note: field(formData, "note") }),
    schema: contestOutcomeSchema,
    labels: { note: "Note" },
    messages: { ...STALE, "invalid-lead-stage": "This outcome can no longer be contested. Refresh the page." },
    perform: async (context, input) => {
      await contestOutcome(dbFor(context), getDomain(), actorOf(context), input);
    },
    revalidate: PAGES,
  });
}

/** The coordinator asks Fynix to review a rejection within 48 hours, with a note. */
export async function requestRejectionReviewAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runTenantForm({
    formData,
    fieldNames: ["note"],
    kinds: ["agency"],
    build: () => ({ leadId: field(formData, "leadId"), note: field(formData, "note") }),
    schema: requestRejectionReviewSchema,
    labels: { note: "Note" },
    messages: { ...STALE, "invalid-lead-stage": "A review can be asked for a rejection the client made after the meeting. Refresh the page." },
    perform: async (context, input) => {
      await requestRejectionReview(dbFor(context), getDomain(), actorOf(context), input);
    },
    revalidate: PAGES,
  });
}
