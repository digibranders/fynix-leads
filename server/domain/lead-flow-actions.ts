"use server";

import type { FormState } from "@/lib/fynix/form-state";
import { getDatabase } from "@/server/db/client";
import { getDomain } from "@/server/domain";
import type { TenantActor } from "@/server/domain/alias-identity";
import type { SessionContext } from "@/server/auth/session-context";
import { clientReviewLeadSchema, decideLeadSchema, recordMeetingOutcomeSchema } from "@/server/domain/inputs";
import { clientReviewLead, decideLead } from "@/server/domain/leads";
import { recordMeetingOutcome } from "@/server/domain/meetings";
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
