"use server";

import { after } from "next/server";
import { z } from "zod";
import { parseBlockForm } from "@/lib/fynix/block-form";
import { fieldErrors, type FormState } from "@/lib/fynix/form-state";
import { parseHoursGrid } from "@/lib/fynix/hours-form";
import { sendQueuedMail } from "@/server/domain";
import { publishAgreement } from "@/server/domain/agreements";
import { DomainError } from "@/server/domain/errors";
import { addHostBlock, removeHostBlock, setHostHours } from "@/server/domain/availability";
import {
  memberDetailsSchema,
  memberRoleSchema,
  updateClientContactSchema,
  updateOrganisationSchema,
  addHostBlockSchema,
  closeCampaignSchema,
  createCampaignSchema,
  createPartnerAgencySchema,
  createOrganisationSchema,
  createCoordinatorSchema,
  firstPersonSchema,
  overturnRejectionSchema,
  recordMeetingOutcomeSchema,
  issueInviteSchema,
  publishAgreementSchema,
  publishTermsSchema,
  removeCampaignShareSchema,
  setCampaignShareSchema,
  setHostHoursSchema,
  updateCampaignSchema,
  uuidSchema,
} from "@/server/domain/inputs";
import { issueInvite, resendInvite, revokeInvite } from "@/server/domain/invites";
import { reactivateMember, setMemberRole, suspendMember, updateMemberDetails } from "@/server/domain/members";
import { LETTER_OPENING_MAX, checkLetterOpening } from "@/lib/email/letter-opening";
import { setCampaignPrivacy, setProspectEmail, setProspectLetterOpening } from "@/server/domain/campaign-privacy";
import { closeCampaign, createCampaign, reopenCampaign, updateCampaign } from "@/server/domain/campaigns";
import { removeCampaignShare, setCampaignShare } from "@/server/domain/shares";
import { fynixOverturnRejection } from "@/server/domain/leads";
import { fynixRecordMeetingOutcome } from "@/server/domain/meetings";
import { inviteClientContact, removeClientContact, updateClientContact } from "@/server/domain/client-contacts";
import { createOrganisation, setOrganisationStatus, updateOrganisation } from "@/server/domain/organisations";
import { createPartnerAgencyWithFirstPerson, createCoordinatorWithFirstPerson } from "@/server/domain/coordinators";
import { publishTerms } from "@/server/domain/terms";
import { CONTACT_FIELDS, CONTACT_LABELS, contactUpdateBody } from "@/server/fynix/contact-fields";
import { CONTACT_ROW_FIELDS, contactRowProblems, contactRowsBody } from "@/server/fynix/contact-rows";
import { firstInviteNotice } from "@/server/fynix/first-person";
import { field, numberField, runAction } from "@/server/fynix/run-action";

/**
 * The server actions behind the Fynix admin forms. Each one is a thin shell over `runAction` (session, field errors, the domain
 * call, plain-words refusals, revalidation) and a domain function that holds the rules, so the admin check and the audit row
 * are the domain's. Every export of a "use server" file is a public endpoint, so this file exports only actions.
 */

const CAMPAIGN_FIELDS = [
  "name", "clientOrgId", "agencyOrgId", "startDate", "endDate", "monthlyTarget", "totalTarget", "geography", "industries", "companySize", "icp", "jobTitles",
  "seniority", "technologies", "bantBudget", "bantAuthority", "bantNeed", "bantTimeline", "instructions", "internalNotes", "timeZone", "meetingMinutes", "status",
  "pitchIntroduction", "pitchServices", "pitchDifferentiator", "pitchCollaterals", "pitchCaseStudies", "qualifyingQuestions", "qualifyingItems", "firstEmail", "secondEmail", "primaryContactId",
] as const;

const CAMPAIGN_LABELS = {
  name: "Name", clientOrgId: "Client", agencyOrgId: "Coordinator", startDate: "Start date", endDate: "End date", monthlyTarget: "Per month", totalTarget: "In total",
  geography: "Geography", industries: "Industries", companySize: "Company size", icp: "Ideal customer", jobTitles: "Job titles", seniority: "Seniority",
  technologies: "Technologies", bantBudget: "Budget", bantAuthority: "Authority", bantNeed: "Need", bantTimeline: "Timeline", instructions: "Instructions",
  internalNotes: "Internal notes", timeZone: "Time zone", meetingMinutes: "Meeting length", status: "Status",
  pitchIntroduction: "Introduction", pitchServices: "Services", pitchDifferentiator: "What sets them apart", pitchCollaterals: "Collaterals", pitchCaseStudies: "Case studies",
  qualifyingQuestions: "Qualifying questions", qualifyingItems: "Qualifying questions", firstEmail: "First email", secondEmail: "Second email", primaryContactId: "Contact person",
} as const;

/** "a, b, c" or one per line as a list of trimmed, non-empty entries. */
function listField(formData: FormData, name: string): string[] {
  return field(formData, name).split(/[,\n]/).map((entry) => entry.trim()).filter((entry) => entry !== "");
}

/** The questions posted as JSON by the questions editor. Anything that is not a list of {question, answer} goes to the schema as it is, which refuses it. */
function itemsField(formData: FormData): unknown {
  try {
    return JSON.parse(field(formData, "qualifyingItems") || "[]") as unknown;
  } catch {
    return "not a list";
  }
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
    pitchIntroduction: field(formData, "pitchIntroduction"),
    pitchServices: field(formData, "pitchServices"),
    pitchDifferentiator: field(formData, "pitchDifferentiator"),
    pitchCollaterals: field(formData, "pitchCollaterals"),
    pitchCaseStudies: field(formData, "pitchCaseStudies"),
    qualifyingQuestions: field(formData, "qualifyingQuestions"),
    qualifyingItems: itemsField(formData),
    firstEmail: field(formData, "firstEmail"),
    secondEmail: field(formData, "secondEmail"),
    ...(timeZone === "" ? {} : { timeZone }),
    ...(meetingMinutes === undefined ? {} : { meetingMinutes }),
  };
}

/** Creates a draft campaign for a client and a coordinator, then opens it. */
export async function createCampaignAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const internalNotes = field(formData, "internalNotes").trim();
  const primaryContactId = field(formData, "primaryContactId");
  return runAction({
    formData,
    fieldNames: CAMPAIGN_FIELDS,
    build: () => ({ clientOrgId: field(formData, "clientOrgId"), agencyOrgId: field(formData, "agencyOrgId"), ...campaignBody(formData), ...(internalNotes === "" ? {} : { internalNotes }), ...(primaryContactId === "" ? {} : { primaryContactId }) }),
    schema: createCampaignSchema,
    labels: CAMPAIGN_LABELS,
    perform: async (deps, actor, input) => {
      const created = await createCampaign(deps, actor, input);
      // The agreement is the next thing the campaign needs, so the admin lands on it. When it is published now, it goes with the same numbers the campaign has.
      if (field(formData, "publishAgreement") !== "later") {
        try {
          await publishAgreement(deps, actor, { campaignId: created.id, monthlyTarget: Number(field(formData, "monthlyTarget")), totalTarget: Number(field(formData, "totalTarget")), rules: field(formData, "agreementRules").trim() });
        } catch (error) {
          // The campaign stands. The Agreements tab it opens on says nothing is published and offers to publish it.
          if (!(error instanceof DomainError)) throw error;
        }
      }
      return { redirectTo: `/fynix/campaigns/${created.publicRef}/agreements` };
    },
  });
}

/** Changes a campaign's details, brief, settings and status. The client and the coordinator stay as they were. */
export async function updateCampaignAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const status = field(formData, "status");
  const internalNotes = field(formData, "internalNotes").trim();
  const campaignId = field(formData, "campaignId");
  const primaryContactId = field(formData, "primaryContactId");
  return runAction({
    formData,
    fieldNames: CAMPAIGN_FIELDS,
    // Only what the form posted is changed: a field the form does not carry (the old requirement fields) keeps what is stored.
    build: () => ({
      ...Object.fromEntries(Object.entries(campaignBody(formData)).filter(([key]) => formData.has(key))),
      ...(formData.has("internalNotes") ? { internalNotes: internalNotes === "" ? null : internalNotes } : {}),
      primaryContactId: primaryContactId === "" ? null : primaryContactId,
      ...(status === "" ? {} : { status }),
    }),
    schema: updateCampaignSchema,
    labels: CAMPAIGN_LABELS,
    perform: async (deps, actor, input) => {
      await updateCampaign(deps, actor, campaignId, input);
    },
  });
}

/** Makes a campaign active. The going-live rule decides, and its refusal says which side has not accepted the agreement, or that there is no host. */
export async function makeCampaignActiveAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const campaignId = field(formData, "campaignId");
  return runAction({
    formData,
    fieldNames: [],
    build: () => ({ status: "active" }),
    schema: updateCampaignSchema,
    labels: {},
    ownMessages: ["agreement-not-accepted", "no-host"],
    perform: async (deps, actor, input) => {
      await updateCampaign(deps, actor, campaignId, input);
    },
  });
}

/** Closes a campaign with an optional note for the record. A closed campaign is read only. */
export async function closeCampaignAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: ["note"],
    build: () => ({ campaignId: field(formData, "campaignId"), note: field(formData, "note") }),
    schema: closeCampaignSchema,
    labels: { note: "Note" },
    messages: { "invalid-transition": "That campaign is closed already." },
    perform: async (deps, actor, input) => {
      const parsed = closeCampaignSchema.parse(input);
      await closeCampaign(deps, actor, parsed.campaignId, parsed.note);
    },
  });
}

const reopenInput = z.object({ campaignId: uuidSchema }).strict();

/** Reopens a closed campaign as a campaign being set up. Fynix then makes it active, and the going-live rule applies again. */
export async function reopenCampaignAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: [],
    build: () => ({ campaignId: field(formData, "campaignId") }),
    schema: reopenInput,
    labels: {},
    messages: { "invalid-transition": "That campaign is not closed." },
    perform: async (deps, actor, input) => {
      await reopenCampaign(deps, actor, reopenInput.parse(input).campaignId);
    },
  });
}

/** What the Add coordinator page asks for: a coordinator is one person, so their name, email and phone are all there is. */
const ADD_COORDINATOR_FIELDS = ["name", "email", "phone"] as const;
const COORDINATOR_LABELS = { name: "Name", email: "Email", phone: "Phone" } as const;

/** The coordinator or agency as the person who signs in: the invite fields, with the job title the form does not ask for. */
function soloPerson(get: (name: string) => string, jobTitle: "Coordinator" | "Agency"): Record<string, string> {
  const phone = get("phone").trim();
  return { name: get("name").trim(), jobTitle, email: get("email").trim(), role: "manager", ...(phone === "" ? {} : { phone }) };
}

/**
 * Adds a coordinator: one person, who is both the coordinator record and the person invited to sign in. Their name names the record, and the
 * name, email and phone are kept as its contact. If the invite is refused (the email is taken, or no terms are published) the coordinator is still added and the notice says why.
 */
export async function addCoordinatorAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const get = (name: string) => field(formData, name);
  const phone = get("phone").trim();
  return runAction({
    formData,
    fieldNames: ADD_COORDINATOR_FIELDS,
    precheck: () => {
      const checked = firstPersonSchema.safeParse(soloPerson(get, "Coordinator"));
      return checked.success ? {} : fieldErrors(checked.error, COORDINATOR_LABELS);
    },
    build: () => ({ name: get("name"), contactName: get("name").trim(), contactEmail: get("email").trim(), ...(phone === "" ? {} : { contactPhone: phone }), confirmDuplicate: get("confirmDuplicate") === "on" }),
    schema: createCoordinatorSchema,
    labels: { name: "Name", contactEmail: "Email", contactPhone: "Phone" },
    errorFields: { "duplicate-name": "confirmDuplicate" },
    messages: { "duplicate-name": "A coordinator with that name already exists." },
    perform: async (deps, actor, input) => {
      const { organisation, firstInvite } = await createCoordinatorWithFirstPerson(deps, actor, input, soloPerson(get, "Coordinator"));
      if (firstInvite.status === "sent") sendMailAfterResponse();
      const notice = firstInviteNotice("coordinator", firstInvite);
      return { redirectTo: `/fynix/coordinators/${organisation.publicRef}`, ...(notice === undefined ? {} : { notice }) };
    },
  });
}

/** What the Add client page asks for: the name, the website, and any number of contact people. The profile, time zone and the rest come with the campaign. */
const ADD_CLIENT_FIELDS = ["name", "website", ...CONTACT_ROW_FIELDS] as const;

export async function addClientAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const get = (name: string) => field(formData, name);
  const website = get("website").trim();
  return runAction({
    formData,
    fieldNames: ADD_CLIENT_FIELDS,
    precheck: () => contactRowProblems(get),
    build: () => ({ kind: "client", name: get("name"), ...(website === "" ? {} : { website }), contacts: contactRowsBody(get), confirmDuplicate: get("confirmDuplicate") === "on" }),
    schema: createOrganisationSchema,
    labels: { name: "Name", website: CONTACT_LABELS.website },
    errorFields: { "duplicate-name": "confirmDuplicate" },
    messages: { "duplicate-name": "A client with that name already exists." },
    perform: async (deps, actor, input) => {
      const created = await createOrganisation(deps, actor, input);
      return { redirectTo: `/fynix/clients/${created.publicRef}` };
    },
  });
}

const CONTACT_PERSON_FIELDS = ["name", "email", "phone", "jobTitle"] as const;
const CONTACT_PERSON_LABELS = { name: "Name", email: "Email", phone: "Phone", jobTitle: "Job title" } as const;

/** Changes a contact person. A blank email, phone or job title clears it. */
export async function updateClientContactAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const blankToNull = (name: string) => (field(formData, name).trim() === "" ? null : field(formData, name).trim());
  return runAction({
    formData,
    fieldNames: CONTACT_PERSON_FIELDS,
    build: () => ({ contactId: field(formData, "contactId"), name: field(formData, "name"), email: blankToNull("email"), phone: blankToNull("phone"), jobTitle: blankToNull("jobTitle") }),
    schema: updateClientContactSchema,
    labels: CONTACT_PERSON_LABELS,
    messages: { "not-found": "That contact is gone already." },
    perform: async (deps, actor, input) => {
      await updateClientContact(deps, actor, input);
    },
  });
}

const contactInput = z.object({ contactId: uuidSchema }).strict();

/** Takes a contact person off the client. */
export async function removeClientContactAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: [],
    build: () => ({ contactId: field(formData, "contactId") }),
    schema: contactInput,
    labels: {},
    messages: { "not-found": "That contact is gone already." },
    perform: async (deps, actor, input) => {
      await removeClientContact(deps, actor, contactInput.parse(input).contactId);
    },
  });
}

/** Invites a saved contact to the portal as a member of their client. The contact stays on the list. */
export async function inviteClientContactAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: [],
    build: () => ({ contactId: field(formData, "contactId") }),
    schema: contactInput,
    labels: {},
    messages: { "not-found": "That contact is gone already." },
    ownMessages: ["invalid-input"],
    perform: async (deps, actor, input) => {
      await inviteClientContact(deps, actor, contactInput.parse(input).contactId);
      sendMailAfterResponse();
    },
  });
}

/** Changes a client's or coordinator's name and time zone. A blank time zone clears it. */
export async function updateOrganisationAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const timeZone = field(formData, "timeZone").trim();
  const organisationId = field(formData, "organisationId");
  return runAction({
    formData,
    fieldNames: ["name", "timeZone"],
    build: () => ({ name: field(formData, "name"), timeZone: timeZone === "" ? null : timeZone }),
    schema: updateOrganisationSchema,
    labels: { name: "Name", timeZone: "Time zone" },
    perform: async (deps, actor, input) => {
      await updateOrganisation(deps, actor, organisationId, input);
    },
  });
}

/** Changes a client's, coordinator's or agency's contact details. A blank field clears it. */
export async function updateContactAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const organisationId = field(formData, "organisationId");
  return runAction({
    formData,
    fieldNames: CONTACT_FIELDS,
    build: () => contactUpdateBody((name) => field(formData, name)),
    schema: updateOrganisationSchema,
    labels: CONTACT_LABELS,
    perform: async (deps, actor, input) => {
      await updateOrganisation(deps, actor, organisationId, input);
    },
  });
}

const statusInput = z.object({ organisationId: uuidSchema, status: z.enum(["active", "archived"]) }).strict();

export async function setOrganisationStatusAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: [],
    build: () => ({ organisationId: field(formData, "organisationId"), status: field(formData, "status") }),
    schema: statusInput,
    labels: {},
    perform: async (deps, actor, input) => {
      const parsed = statusInput.parse(input);
      await setOrganisationStatus(deps, actor, parsed.organisationId, parsed.status);
    },
  });
}

/** Changes a person's name, job title and phone. A blank phone clears it. */
export async function updatePersonAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const phone = field(formData, "phone").trim();
  const memberId = field(formData, "memberId");
  return runAction({
    formData,
    fieldNames: ["displayName", "phone"],
    build: () => ({ displayName: field(formData, "displayName"), phone: phone === "" ? null : phone }),
    schema: memberDetailsSchema,
    labels: { displayName: "Name", phone: "Phone" },
    perform: async (deps, actor, input) => {
      await updateMemberDetails(deps, actor, memberId, input);
    },
  });
}

const memberInput = z.object({ memberId: uuidSchema }).strict();

const roleInput = z.object({ memberId: uuidSchema, role: memberRoleSchema }).strict();

/** Makes a person a manager or a plain member. The last active manager of an organisation cannot be made a member. */
export async function setPersonRoleAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: [],
    build: () => ({ memberId: field(formData, "memberId"), role: field(formData, "role") }),
    schema: roleInput,
    labels: {},
    messages: { "invalid-transition": "That person has this role already. Refresh the page." },
    perform: async (deps, actor, input) => {
      const parsed = roleInput.parse(input);
      await setMemberRole(deps, actor, parsed.memberId, parsed.role);
    },
  });
}

export async function suspendPersonAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: [],
    build: () => ({ memberId: field(formData, "memberId") }),
    schema: memberInput,
    labels: {},
    messages: { "invalid-transition": "That person is suspended already." },
    perform: async (deps, actor, input) => {
      await suspendMember(deps, actor, memberInput.parse(input).memberId);
    },
  });
}

export async function reactivatePersonAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: [],
    build: () => ({ memberId: field(formData, "memberId") }),
    schema: memberInput,
    labels: {},
    messages: { "invalid-transition": "That person is active already." },
    perform: async (deps, actor, input) => {
      await reactivateMember(deps, actor, memberInput.parse(input).memberId);
    },
  });
}

const inviteInput = z.object({ inviteId: uuidSchema }).strict();

export async function resendInviteAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: [],
    build: () => ({ inviteId: field(formData, "inviteId") }),
    schema: inviteInput,
    labels: {},
    perform: async (deps, actor, input) => {
      await resendInvite(deps, actor, inviteInput.parse(input).inviteId);
      sendMailAfterResponse();
    },
  });
}

export async function revokeInviteAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: [],
    build: () => ({ inviteId: field(formData, "inviteId") }),
    schema: inviteInput,
    labels: {},
    perform: async (deps, actor, input) => {
      await revokeInvite(deps, actor, inviteInput.parse(input).inviteId);
    },
  });
}

const LEAD_REFUSALS = { "invalid-lead-stage": "This lead has moved on since you opened it. Refresh the page.", "outcome-already-recorded": "Someone recorded this outcome already. Refresh the page." } as const;

/** Fynix changes a client's rejection to accepted, with its own note. Admin and staff both may. */
export async function overturnRejectionAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: ["note"],
    build: () => ({ leadId: field(formData, "leadId"), note: field(formData, "note") }),
    schema: overturnRejectionSchema,
    labels: { note: "Note" },
    messages: LEAD_REFUSALS,
    perform: async (deps, actor, input) => {
      await fynixOverturnRejection(deps.fynixDb, deps, actor, input);
    },
  });
}

/** Fynix records how a meeting went. The first side to record sets it. */
export async function fynixRecordOutcomeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const notes = field(formData, "notes").trim();
  return runAction({
    formData,
    fieldNames: ["outcome", "notes"],
    build: () => ({ meetingId: field(formData, "meetingId"), outcome: field(formData, "outcome"), ...(notes === "" ? {} : { notes }) }),
    schema: recordMeetingOutcomeSchema,
    labels: { outcome: "Outcome", notes: "Notes" },
    messages: LEAD_REFUSALS,
    perform: async (deps, actor, input) => {
      await fynixRecordMeetingOutcome(deps.fynixDb, deps, actor, input);
    },
  });
}

/**
 * Adds a partner agency under a coordinator: one person, who is both the agency record and the person invited to sign in. Their name names the
 * record, and the name, email and phone are kept as its contact. If the invite is refused the agency is still added and the notice says why.
 */
export async function addAgencyAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const get = (name: string) => field(formData, name);
  const phone = get("phone").trim();
  return runAction({
    formData,
    fieldNames: [...ADD_COORDINATOR_FIELDS, "coordinatorId"],
    precheck: () => {
      const checked = firstPersonSchema.safeParse(soloPerson(get, "Agency"));
      return checked.success ? {} : fieldErrors(checked.error, COORDINATOR_LABELS);
    },
    build: () => ({ coordinatorId: get("coordinatorId"), name: get("name"), contactName: get("name").trim(), contactEmail: get("email").trim(), ...(phone === "" ? {} : { contactPhone: phone }), confirmDuplicate: get("confirmDuplicate") === "on" }),
    schema: createPartnerAgencySchema,
    labels: { coordinatorId: "Coordinator", name: "Name", contactEmail: "Email", contactPhone: "Phone" },
    errorFields: { "duplicate-name": "confirmDuplicate" },
    messages: { "duplicate-name": "This coordinator already has an agency with that name." },
    perform: async (deps, actor, input) => {
      const { firstInvite } = await createPartnerAgencyWithFirstPerson(deps, actor, input, soloPerson(get, "Agency"));
      if (firstInvite.status === "sent") sendMailAfterResponse();
      const notice = firstInviteNotice("agency", firstInvite);
      return notice === undefined ? undefined : { notice };
    },
  });
}

const INVITE_ROLES: ReadonlySet<string> = new Set(["member", "manager", "admin", "staff"]);

/** The invite and its email are saved together; sending the email waits until the response has gone. */
function sendMailAfterResponse(): void {
  after(async () => {
    try {
      await sendQueuedMail();
    } catch (error) {
      console.error("Sending queued mail failed", error instanceof Error ? error.name : "unknown error");
    }
  });
}

export async function invitePersonAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: ["organisationId", "name", "email", "phone", "role", "alias"],
    build: () => {
      const phone = field(formData, "phone").trim();
      const alias = field(formData, "alias").trim();
      return {
        organisationId: field(formData, "organisationId"),
        name: field(formData, "name"),
        email: field(formData, "email"),
        role: INVITE_ROLES.has(field(formData, "role")) ? field(formData, "role") : "member",
        ...(phone === "" ? {} : { phone }),
        ...(alias === "" ? {} : { alias }),
      };
    },
    schema: issueInviteSchema,
    labels: { organisationId: "Organisation", name: "Name", jobTitle: "Job title", email: "Email", phone: "Phone", role: "Role", alias: "Name the client sees" },
    perform: async (deps, actor, input) => {
      await issueInvite(deps, actor, issueInviteSchema.parse(input));
      sendMailAfterResponse();
    },
  });
}

export async function publishAgreementAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: ["monthlyTarget", "totalTarget", "rules", "notes"],
    build: () => ({
      campaignId: field(formData, "campaignId"),
      monthlyTarget: numberField(formData, "monthlyTarget"),
      totalTarget: numberField(formData, "totalTarget"),
      rules: field(formData, "rules"),
      notes: field(formData, "notes"),
    }),
    schema: publishAgreementSchema,
    labels: { monthlyTarget: "Per month", totalTarget: "In total", rules: "Counting rules", notes: "Notes" },
    perform: async (deps, actor, input) => {
      await publishAgreement(deps, actor, input);
    },
  });
}

export async function publishTermsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: ["party", "title", "body"],
    build: () => ({ party: field(formData, "party"), title: field(formData, "title"), body: field(formData, "body") }),
    schema: publishTermsSchema,
    labels: { party: "Side", title: "Title", body: "Text" },
    perform: async (deps, actor, input) => {
      await publishTerms(deps, actor, input);
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

export async function setHoursAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const grid = parseHoursGrid((name) => field(formData, name));
  return runAction({
    formData,
    fieldNames: ["timeZone"],
    precheck: () => grid.errors,
    build: () => ({ memberId: field(formData, "memberId"), timeZone: field(formData, "timeZone"), hours: grid.windows }),
    schema: setHostHoursSchema,
    labels: { memberId: "Team member", timeZone: "Time zone", hours: "Hours" },
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

const privacyLinkInput = z.object({ campaignId: uuidSchema, url: z.string().trim().min(1, "Add the link to the client's privacy page.") }).strict();
const PRIVACY_LINK_MESSAGE = "Use the full link to the client's privacy page, starting with https://.";

/** Sets or replaces the client's privacy page link. The domain accepts only a full https address. */
export async function setPrivacyLinkAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: ["url"],
    build: () => ({ campaignId: field(formData, "campaignId"), url: field(formData, "url") }),
    schema: privacyLinkInput,
    labels: { url: "Privacy page link" },
    messages: { "invalid-input": PRIVACY_LINK_MESSAGE },
    errorFields: { "invalid-input": "url" },
    perform: async (deps, actor, input) => {
      const { campaignId, url } = privacyLinkInput.parse(input);
      await setCampaignPrivacy(deps, actor, campaignId, url);
    },
  });
}

const campaignOnly = z.object({ campaignId: uuidSchema }).strict();

/** Removes the privacy link. This also switches prospect email off for the campaign. */
export async function removePrivacyLinkAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: [],
    build: () => ({ campaignId: field(formData, "campaignId") }),
    schema: campaignOnly,
    labels: {},
    perform: async (deps, actor, input) => {
      await setCampaignPrivacy(deps, actor, campaignOnly.parse(input).campaignId, null);
    },
  });
}

const letterOpeningInput = z.object({ campaignId: uuidSchema, text: z.string().trim().min(1).max(LETTER_OPENING_MAX) }).strict();

/** Sets or replaces the campaign's opening paragraph for the confirmation letter to prospects. */
export async function setLetterOpeningAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: ["text"],
    build: () => ({ campaignId: field(formData, "campaignId"), text: field(formData, "text") }),
    schema: letterOpeningInput,
    labels: { text: "Opening paragraph" },
    // The rules of the paragraph, each in its own sentence, on the field. The names of the coordinator and the agencies are checked by the domain, which can read them.
    precheck: (): Record<string, string> => {
      const { problems } = checkLetterOpening(field(formData, "text"));
      return problems.length === 0 ? {} : { text: problems.join(" ") };
    },
    errorFields: { "invalid-input": "text", "letter-names-supply-side": "text" },
    ownMessages: ["invalid-input"],
    perform: async (deps, actor, input) => {
      const { campaignId, text } = letterOpeningInput.parse(input);
      await setProspectLetterOpening(deps, actor, campaignId, text);
    },
  });
}

/** Removes the campaign's opening paragraph. The confirmation letter goes back to the default wording. */
export async function removeLetterOpeningAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: [],
    build: () => ({ campaignId: field(formData, "campaignId") }),
    schema: campaignOnly,
    labels: {},
    perform: async (deps, actor, input) => {
      await setProspectLetterOpening(deps, actor, campaignOnly.parse(input).campaignId, null);
    },
  });
}

const prospectEmailInput = z.object({ campaignId: uuidSchema, enabled: z.enum(["true", "false"]) }).strict();

/** Switches letters to prospects on or off for one campaign. On is refused until the privacy link is set. */
export async function setProspectEmailAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: [],
    build: () => ({ campaignId: field(formData, "campaignId"), enabled: field(formData, "enabled") }),
    schema: prospectEmailInput,
    labels: {},
    perform: async (deps, actor, input) => {
      const { campaignId, enabled } = prospectEmailInput.parse(input);
      await setProspectEmail(deps, actor, campaignId, enabled === "true");
    },
  });
}
