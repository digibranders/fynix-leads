"use server";

import { z } from "zod";
import { parseBlockForm } from "@/lib/fynix/block-form";
import { parseHoursGrid } from "@/lib/fynix/hours-form";
import type { FormState } from "@/lib/fynix/form-state";
import { getDatabase } from "@/server/db/client";
import { getDomain } from "@/server/domain";
import type { TenantActor } from "@/server/domain/alias-identity";
import { addOwnBlock, removeOwnBlock, setOwnHours } from "@/server/domain/hosts-tenant";
import { createCoordinatorPartnerAgencySchema, issueInviteSchema, memberDetailsSchema, replyInvitationSchema, ownBlockSchema, ownHoursSchema, ownProfileSchema, uuidSchema } from "@/server/domain/inputs";
import { issueTenantInvite } from "@/server/domain/invites";
import { replyToInvitation } from "@/server/domain/meeting-invitations";
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
const TEAM_PAGES = ["/client/team", "/coordinator/team", "/agency/team", "/coordinator/agencies", "/fynix"] as const;
const HOURS_PAGES = ["/client/hours"] as const;
const INVITATION_PAGES = ["/client"] as const;
const PROFILE_PAGES = ["/client", "/coordinator", "/agency", "/fynix"] as const;

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
    schema: createCoordinatorPartnerAgencySchema,
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

/** A person replaces their own weekly hours. Empty days are days off. */
export async function setOwnHoursAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const grid = parseHoursGrid((name) => field(formData, name));
  return runTenantForm({
    formData,
    fieldNames: ["timeZone"],
    kinds: ["client"],
    precheck: () => grid.errors,
    build: () => ({ timeZone: field(formData, "timeZone"), hours: grid.windows }),
    schema: ownHoursSchema,
    labels: { timeZone: "Time zone", hours: "Hours" },
    perform: async (context, input) => {
      await setOwnHours(dbFor(context), actorOf(context), input);
    },
    revalidate: HOURS_PAGES,
  });
}

/** A person blocks a time for themselves, in the zone of their hours. */
export async function addOwnBlockAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseBlockForm((name) => field(formData, name), field(formData, "timeZone"));
  return runTenantForm({
    formData,
    fieldNames: ["date", "endDate", "allDay", "start", "end", "note"],
    kinds: ["client"],
    precheck: () => parsed.errors,
    build: () => ({ startsAt: parsed.startsAt, endsAt: parsed.endsAt, note: field(formData, "note") }),
    schema: ownBlockSchema,
    labels: { note: "Note", startsAt: "Start", endsAt: "End" },
    perform: async (context, input) => {
      await addOwnBlock(dbFor(context), actorOf(context), input);
    },
    revalidate: HOURS_PAGES,
  });
}

const blockInput = z.object({ blockId: uuidSchema }).strict();

/** A person removes one of their own blocked times. */
export async function removeOwnBlockAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runTenantForm({
    formData,
    fieldNames: [],
    kinds: ["client"],
    build: () => ({ blockId: field(formData, "blockId") }),
    schema: blockInput,
    labels: {},
    perform: async (context, input) => {
      await removeOwnBlock(dbFor(context), actorOf(context), blockInput.parse(input).blockId);
    },
    revalidate: HOURS_PAGES,
  });
}

/** A client person accepts or declines an invitation to a meeting. The first to accept takes it; the form posts `meetingId` and, from the button pressed, `reply`. */
export async function replyInvitationAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runTenantForm({
    formData,
    fieldNames: [],
    kinds: ["client"],
    build: () => ({ meetingId: field(formData, "meetingId"), reply: field(formData, "reply") }),
    schema: replyInvitationSchema,
    labels: { meetingId: "Meeting", reply: "Answer" },
    perform: async (context, input) => {
      await replyToInvitation(dbFor(context), getDomain(), actorOf(context), input);
    },
    revalidate: INVITATION_PAGES,
  });
}
