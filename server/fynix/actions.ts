"use server";

import { after } from "next/server";
import { z } from "zod";
import { parseBlockForm } from "@/lib/fynix/block-form";
import type { FormState } from "@/lib/fynix/form-state";
import { parseHoursGrid } from "@/lib/fynix/hours-form";
import { sendQueuedMail } from "@/server/domain";
import { publishAgreement } from "@/server/domain/agreements";
import { addHostBlock, removeHostBlock, setHostHours } from "@/server/domain/availability";
import { addCampaignHost, deactivateCampaignHost } from "@/server/domain/hosts";
import {
  addCampaignHostSchema,
  addHostBlockSchema,
  createCampaignSchema,
  createPartnerAgencySchema,
  createOrganisationSchema,
  createSupplierSchema,
  resolveDisputeSchema,
  deactivateCampaignHostSchema,
  issueInviteSchema,
  publishAgreementSchema,
  removeCampaignShareSchema,
  setCampaignShareSchema,
  setHostHoursSchema,
  updateCampaignSchema,
  uuidSchema,
} from "@/server/domain/inputs";
import { issueInvite } from "@/server/domain/invites";
import { createCampaign, updateCampaign } from "@/server/domain/campaigns";
import { removeCampaignShare, setCampaignShare } from "@/server/domain/shares";
import { fynixResolveDispute } from "@/server/domain/leads";
import { createOrganisation } from "@/server/domain/organisations";
import { createPartnerAgency, createSupplier } from "@/server/domain/suppliers";
import { field, numberField, runAction } from "@/server/fynix/run-action";

/**
 * The server actions behind the Fynix admin forms. Each one is a thin shell over `runAction` (session, field errors, the domain
 * call, plain-words refusals, revalidation) and a domain function that holds the rules, so the admin check and the audit row
 * are the domain's. Every export of a "use server" file is a public endpoint, so this file exports only actions.
 */

const CAMPAIGN_FIELDS = [
  "name", "clientOrgId", "agencyOrgId", "startDate", "endDate", "monthlyTarget", "totalTarget", "geography", "industries", "companySize", "icp", "jobTitles",
  "seniority", "technologies", "bantBudget", "bantAuthority", "bantNeed", "bantTimeline", "instructions", "internalNotes", "timeZone", "meetingMinutes", "status",
] as const;

const CAMPAIGN_LABELS = {
  name: "Name", clientOrgId: "Client", agencyOrgId: "Coordinator", startDate: "Start date", endDate: "End date", monthlyTarget: "Per month", totalTarget: "In total",
  geography: "Geography", industries: "Industries", companySize: "Company size", icp: "Ideal customer", jobTitles: "Job titles", seniority: "Seniority",
  technologies: "Technologies", bantBudget: "Budget", bantAuthority: "Authority", bantNeed: "Need", bantTimeline: "Timeline", instructions: "Instructions",
  internalNotes: "Internal notes", timeZone: "Time zone", meetingMinutes: "Meeting length", status: "Status",
} as const;

/** "a, b, c" or one per line as a list of trimmed, non-empty entries. */
function listField(formData: FormData, name: string): string[] {
  return field(formData, name).split(/[,\n]/).map((entry) => entry.trim()).filter((entry) => entry !== "");
}

/** The brief and settings of a campaign as the domain takes them. A blank time zone or length is left out, so the defaults apply. */
function campaignBody(formData: FormData) {
  const timeZone = field(formData, "timeZone").trim();
  const meetingMinutes = numberField(formData, "meetingMinutes");
  return {
    name: field(formData, "name"),
    startDate: field(formData, "startDate"),
    endDate: field(formData, "endDate"),
    monthlyTarget: numberField(formData, "monthlyTarget"),
    totalTarget: numberField(formData, "totalTarget"),
    geography: field(formData, "geography"),
    industries: listField(formData, "industries"),
    companySize: field(formData, "companySize"),
    icp: field(formData, "icp"),
    jobTitles: listField(formData, "jobTitles"),
    seniority: field(formData, "seniority"),
    technologies: listField(formData, "technologies"),
    bantBudget: field(formData, "bantBudget"),
    bantAuthority: field(formData, "bantAuthority"),
    bantNeed: field(formData, "bantNeed"),
    bantTimeline: field(formData, "bantTimeline"),
    instructions: field(formData, "instructions"),
    ...(timeZone === "" ? {} : { timeZone }),
    ...(meetingMinutes === undefined ? {} : { meetingMinutes }),
  };
}

/** Creates a draft campaign for a client and a supplier, then opens it. */
export async function createCampaignAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const internalNotes = field(formData, "internalNotes").trim();
  return runAction({
    formData,
    fieldNames: CAMPAIGN_FIELDS,
    build: () => ({ clientOrgId: field(formData, "clientOrgId"), agencyOrgId: field(formData, "agencyOrgId"), ...campaignBody(formData), ...(internalNotes === "" ? {} : { internalNotes }) }),
    schema: createCampaignSchema,
    labels: CAMPAIGN_LABELS,
    perform: async (deps, actor, input) => {
      const created = await createCampaign(deps, actor, input);
      return { redirectTo: `/fynix/campaigns/${created.publicRef}` };
    },
  });
}

/** Changes a campaign's details, brief, settings and status. The client and the supplier stay as they were. */
export async function updateCampaignAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const status = field(formData, "status");
  const internalNotes = field(formData, "internalNotes").trim();
  const campaignId = field(formData, "campaignId");
  return runAction({
    formData,
    fieldNames: CAMPAIGN_FIELDS,
    build: () => ({ ...campaignBody(formData), internalNotes: internalNotes === "" ? null : internalNotes, ...(status === "" ? {} : { status }) }),
    schema: updateCampaignSchema,
    labels: CAMPAIGN_LABELS,
    perform: async (deps, actor, input) => {
      await updateCampaign(deps, actor, campaignId, input);
    },
  });
}

export async function addSupplierAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: ["name"],
    build: () => ({ name: field(formData, "name") }),
    schema: createSupplierSchema,
    labels: { name: "Name" },
    perform: async (deps, actor, input) => {
      const created = await createSupplier(deps, actor, input);
      return { redirectTo: `/fynix/suppliers?supplier=${created.publicRef}` };
    },
  });
}

export async function addClientAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: ["name", "brandName"],
    build: () => ({ kind: "client", name: field(formData, "name"), brandName: field(formData, "brandName") }),
    schema: createOrganisationSchema,
    labels: { name: "Name", brandName: "Brand name" },
    perform: async (deps, actor, input) => {
      await createOrganisation(deps, actor, input);
    },
  });
}

export async function resolveDisputeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const note = field(formData, "note").trim();
  return runAction({
    formData,
    fieldNames: ["resolution", "note"],
    build: () => ({ leadId: field(formData, "leadId"), resolution: field(formData, "resolution"), ...(note === "" ? {} : { note }) }),
    schema: resolveDisputeSchema,
    labels: { resolution: "Decision", note: "Note" },
    perform: async (deps, actor, input) => {
      await fynixResolveDispute(deps.fynixDb, deps, actor, input);
    },
  });
}

export async function addAgencyAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: ["name"],
    build: () => ({ supplierId: field(formData, "supplierId"), name: field(formData, "name") }),
    schema: createPartnerAgencySchema,
    labels: { name: "Name", supplierId: "Coordinator" },
    perform: async (deps, actor, input) => {
      await createPartnerAgency(deps, actor, input);
    },
  });
}

export async function invitePersonAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: ["organisationId", "name", "email", "role", "alias"],
    build: () => ({
      organisationId: field(formData, "organisationId"),
      name: field(formData, "name"),
      email: field(formData, "email"),
      role: field(formData, "role") === "manager" ? "manager" : "member",
      alias: field(formData, "alias"),
    }),
    schema: issueInviteSchema,
    labels: { organisationId: "Organisation", name: "Name", email: "Email", role: "Role", alias: "Fynix name" },
    perform: async (deps, actor, input) => {
      await issueInvite(deps, actor, issueInviteSchema.parse(input));
      // The invite and its email are saved together; sending the email waits until the response has gone.
      after(async () => {
        try {
          await sendQueuedMail();
        } catch (error) {
          console.error("Sending queued mail failed", error instanceof Error ? error.name : "unknown error");
        }
      });
    },
  });
}

export async function publishAgreementAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: ["monthlyTarget", "totalTarget", "disputeWindowHours", "rules", "notes"],
    build: () => ({
      campaignId: field(formData, "campaignId"),
      party: field(formData, "party"),
      monthlyTarget: numberField(formData, "monthlyTarget"),
      totalTarget: numberField(formData, "totalTarget"),
      disputeWindowHours: numberField(formData, "disputeWindowHours"),
      rules: field(formData, "rules"),
      notes: field(formData, "notes"),
    }),
    schema: publishAgreementSchema,
    labels: { monthlyTarget: "Per month", totalTarget: "In total", disputeWindowHours: "Dispute window", rules: "Counting rules", notes: "Notes", party: "Agreement" },
    perform: async (deps, actor, input) => {
      await publishAgreement(deps, actor, input);
    },
  });
}

export async function setShareAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: ["agencyOrgId", "monthlyShare"],
    build: () => ({ campaignId: field(formData, "campaignId"), agencyOrgId: field(formData, "agencyOrgId"), monthlyShare: numberField(formData, "monthlyShare") }),
    schema: setCampaignShareSchema,
    labels: { agencyOrgId: "Agency", monthlyShare: "Monthly share" },
    perform: async (deps, actor, input) => {
      await setCampaignShare(deps, actor, input);
    },
  });
}

export async function removeShareAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: [],
    build: () => ({ campaignId: field(formData, "campaignId"), agencyOrgId: field(formData, "agencyOrgId") }),
    schema: removeCampaignShareSchema,
    labels: {},
    perform: async (deps, actor, input) => {
      await removeCampaignShare(deps, actor, input);
    },
  });
}

export async function addHostAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: ["memberId", "jobTitle"],
    build: () => ({ campaignId: field(formData, "campaignId"), memberId: field(formData, "memberId"), jobTitle: field(formData, "jobTitle") }),
    schema: addCampaignHostSchema,
    labels: { memberId: "Person", jobTitle: "Job title" },
    messages: { "invalid-transition": "That person is a host of this campaign already." },
    perform: async (deps, actor, input) => {
      await addCampaignHost(deps, actor, input);
    },
  });
}

export async function pauseHostAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: [],
    build: () => ({ campaignId: field(formData, "campaignId"), memberId: field(formData, "memberId") }),
    schema: deactivateCampaignHostSchema,
    labels: {},
    messages: { "invalid-transition": "That host is paused already." },
    perform: async (deps, actor, input) => {
      await deactivateCampaignHost(deps, actor, input);
    },
  });
}

export async function setHoursAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const grid = parseHoursGrid((name) => field(formData, name));
  return runAction({
    formData,
    fieldNames: ["timeZone"],
    precheck: () => grid.errors,
    build: () => ({ memberId: field(formData, "memberId"), timeZone: field(formData, "timeZone"), hours: grid.windows }),
    schema: setHostHoursSchema,
    labels: { memberId: "Host", timeZone: "Time zone", hours: "Hours" },
    perform: async (deps, actor, input) => {
      await setHostHours(deps, actor, input);
    },
  });
}

export async function addBlockAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseBlockForm((name) => field(formData, name), field(formData, "timeZone"));
  return runAction({
    formData,
    fieldNames: ["date", "endDate", "allDay", "start", "end", "note"],
    precheck: () => parsed.errors,
    build: () => ({ memberId: field(formData, "memberId"), startsAt: parsed.startsAt, endsAt: parsed.endsAt, note: field(formData, "note") }),
    schema: addHostBlockSchema,
    labels: { memberId: "Host", note: "Note", startsAt: "Start", endsAt: "End" },
    perform: async (deps, actor, input) => {
      await addHostBlock(deps, actor, input);
    },
  });
}

const removeBlockInput = z.object({ blockId: uuidSchema }).strict();

export async function removeBlockAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: [],
    build: () => ({ blockId: field(formData, "blockId") }),
    schema: removeBlockInput,
    labels: {},
    perform: async (deps, actor, input) => {
      await removeHostBlock(deps, actor, removeBlockInput.parse(input).blockId);
    },
  });
}
