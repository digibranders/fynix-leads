"use server";

import { z } from "zod";
import type { FormState } from "@/lib/fynix/form-state";
import { getDatabase } from "@/server/db/client";
import { getDomain } from "@/server/domain";
import type { TenantActor } from "@/server/domain/alias-identity";
import { createSupplierPartnerAgencySchema, issueInviteSchema, memberDetailsSchema, ownProfileSchema, uuidSchema } from "@/server/domain/inputs";
import { issueTenantInvite } from "@/server/domain/invites";
import { updateOwnMemberDetails } from "@/server/domain/members";
import { field, runTenantForm } from "@/server/tenant/run-form";
import { addPartnerAgencyAsCoordinator, setMemberMeetingEmails, updateOwnFynixProfile, updateOwnProfile } from "@/server/domain/team";
import type { SessionContext } from "@/server/auth/session-context";

/**
 * The forms of the Team pages and the profile page: thin shells over `runTenantForm`, one per domain function. They are public endpoints, so this file
 * exports only actions; the domain functions and the database repeat every rule (who may invite, whom, and what).
 */

const TENANTS = ["client", "agency"] as const;
const EVERYONE = ["client", "agency", "fynix"] as const;
const TEAM_PAGES = ["/client/team", "/supplier/team", "/agency/team", "/supplier/agencies", "/fynix"] as const;
const PROFILE_PAGES = ["/client", "/supplier", "/agency", "/fynix"] as const;

function actorOf(context: SessionContext): TenantActor {
  if (context.kind === "fynix") throw new Error("A Fynix person is not a tenant");
  return { userId: context.userId, orgId: context.orgId, orgKind: context.kind, role: context.memberRole };
}

const dbFor = (context: SessionContext) => getDatabase(context.role).db;
const phoneOrNull = (formData: FormData): string | null => {
  const phone = field(formData, "phone").trim();
  return phone === "" ? null : phone;
};

/** Invites a colleague. A client or partner agency manager invites into their own organisation; a coordinator manager into itself or a partner agency. */
export async function inviteTeamPersonAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runTenantForm({
    formData,
    fieldNames: ["organisationId", "name", "jobTitle", "email", "phone", "role"],
    kinds: TENANTS,
    build: () => {
      const phone = field(formData, "phone").trim();
      const role = field(formData, "role");
      return {
        organisationId: field(formData, "organisationId"),
        name: field(formData, "name"),
        jobTitle: field(formData, "jobTitle"),
        email: field(formData, "email"),
        role: role === "manager" ? "manager" : "member",
        ...(phone === "" ? {} : { phone }),
      };
    },
    schema: issueInviteSchema,
    labels: { organisationId: "Organisation", name: "Name", jobTitle: "Job title", email: "Email", phone: "Phone", role: "Role" },
    perform: async (context, input) => {
      await issueTenantInvite(getDomain(), dbFor(context), actorOf(context), issueInviteSchema.parse(input));
    },
    revalidate: TEAM_PAGES,
    sendMail: true,
  });
}

const memberInput = z.object({ memberId: uuidSchema }).strict();

/** A client manager changes the name, job title or phone of a person in their own client. */
export async function editTeamPersonAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runTenantForm({
    formData,
    fieldNames: ["displayName", "jobTitle", "phone"],
    kinds: ["client"],
    build: () => ({ displayName: field(formData, "displayName"), jobTitle: field(formData, "jobTitle"), phone: phoneOrNull(formData) }),
    schema: memberDetailsSchema,
    labels: { displayName: "Name", jobTitle: "Job title", phone: "Phone" },
    perform: async (context, input) => {
      await updateOwnMemberDetails(dbFor(context), actorOf(context), memberInput.parse({ memberId: field(formData, "memberId") }).memberId, input);
    },
    revalidate: TEAM_PAGES,
  });
}

/** A client manager switches meeting emails on or off for one person. `enabled` is "true" or "false". */
export async function setMeetingEmailsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runTenantForm({
    formData,
    fieldNames: [],
    kinds: ["client"],
    build: () => ({ memberId: field(formData, "memberId") }),
    schema: memberInput,
    labels: {},
    perform: async (context, input) => {
      await setMemberMeetingEmails(dbFor(context), actorOf(context), memberInput.parse(input).memberId, field(formData, "enabled") === "true");
    },
    revalidate: TEAM_PAGES,
  });
}

/** A coordinator manager adds a partner agency under their own coordinator. */
export async function addPartnerAgencyAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runTenantForm({
    formData,
    fieldNames: ["name"],
    kinds: ["agency"],
    build: () => ({ name: field(formData, "name") }),
    schema: createSupplierPartnerAgencySchema,
    labels: { name: "Agency name" },
    messages: { "duplicate-name": "You already have a partner agency with that name.", "not-authorised": "Only a coordinator manager can add a partner agency." },
    errorFields: { "duplicate-name": "name" },
    perform: async (context, input) => {
      await addPartnerAgencyAsCoordinator(getDomain(), dbFor(context), actorOf(context), input);
    },
    revalidate: TEAM_PAGES,
  });
}

/** Everyone changes their own name, job title and phone. */
export async function updateProfileAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runTenantForm({
    formData,
    fieldNames: ["displayName", "jobTitle", "phone"],
    kinds: EVERYONE,
    build: () => ({ displayName: field(formData, "displayName"), jobTitle: field(formData, "jobTitle"), phone: phoneOrNull(formData) }),
    schema: ownProfileSchema,
    labels: { displayName: "Name", jobTitle: "Job title", phone: "Phone" },
    messages: { "not-authorised": "Your details could not be changed. Sign in again." },
    perform: async (context, input) => {
      if (context.kind === "fynix") await updateOwnFynixProfile(dbFor(context), { userId: context.userId }, input);
      else await updateOwnProfile(dbFor(context), { orgId: context.orgId, userId: context.userId }, input);
    },
    revalidate: PROFILE_PAGES,
  });
}
