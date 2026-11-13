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
  createPartnerAgencySchema,
  createSupplierSchema,
  deactivateCampaignHostSchema,
  issueInviteSchema,
  publishAgreementSchema,
  removeCampaignShareSchema,
  setCampaignShareSchema,
  setHostHoursSchema,
  uuidSchema,
} from "@/server/domain/inputs";
import { issueInvite } from "@/server/domain/invites";
import { removeCampaignShare, setCampaignShare } from "@/server/domain/shares";
import { createPartnerAgency, createSupplier } from "@/server/domain/suppliers";
import { field, numberField, runAction } from "@/server/fynix/run-action";

/**
 * The server actions behind the Fynix admin forms. Each one is a thin shell over `runAction` (session, field errors, the domain
 * call, plain-words refusals, revalidation) and a domain function that holds the rules, so the admin check and the audit row
 * are the domain's. Every export of a "use server" file is a public endpoint, so this file exports only actions.
 */

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

export async function addAgencyAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: ["name"],
    build: () => ({ supplierId: field(formData, "supplierId"), name: field(formData, "name") }),
    schema: createPartnerAgencySchema,
    labels: { name: "Name", supplierId: "Supplier" },
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
