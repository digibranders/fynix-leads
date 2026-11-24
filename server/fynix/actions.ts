"use server";

import { after } from "next/server";
import { z } from "zod";
import { parseBlockForm } from "@/lib/fynix/block-form";
import { fieldErrors, type FormState } from "@/lib/fynix/form-state";
import { parseHoursGrid } from "@/lib/fynix/hours-form";
import { sendQueuedMail } from "@/server/domain";
import { publishAgreement } from "@/server/domain/agreements";
import { addHostBlock, removeHostBlock, setHostHours } from "@/server/domain/availability";
import { addCampaignHost, deactivateCampaignHost } from "@/server/domain/hosts";
import {
  addCampaignHostSchema,
  addCollateralSchema,
  clientProfileSchema,
  memberDetailsSchema,
  updateClientProfileSchema,
  updateOrganisationSchema,
  addHostBlockSchema,
  createCampaignSchema,
  createPartnerAgencySchema,
  createOrganisationSchema,
  createSupplierSchema,
  resolveDisputeSchema,
  deactivateCampaignHostSchema,
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
import { reactivateMember, suspendMember, updateMemberDetails } from "@/server/domain/members";
import { createCampaign, updateCampaign } from "@/server/domain/campaigns";
import { removeCampaignShare, setCampaignShare } from "@/server/domain/shares";
import { fynixResolveDispute } from "@/server/domain/leads";
import { addCollateral, createOrganisation, removeCollateral, setOrganisationStatus, updateClientProfile, updateOrganisation } from "@/server/domain/organisations";
import { createPartnerAgency, createSupplier } from "@/server/domain/suppliers";
import { publishTerms } from "@/server/domain/terms";
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
      return { redirectTo: `/fynix/suppliers/${created.publicRef}` };
    },
  });
}

const PROFILE_FIELDS = ["introduction", "services", "differentiator", "caseStudies"] as const;
const PROFILE_LABELS = { introduction: "Introduction", services: "Services", differentiator: "What sets them apart", caseStudies: "Case studies" } as const;

function profileBody(formData: FormData) {
  const caseStudies = field(formData, "caseStudies").trim();
  return { introduction: field(formData, "introduction"), services: field(formData, "services"), differentiator: field(formData, "differentiator"), ...(caseStudies === "" ? {} : { caseStudies }) };
}

/** The link a client form may carry. Both boxes empty is fine; one without the other is a problem on the box that is missing. */
function collateralBody(formData: FormData) {
  return { kind: "link" as const, title: field(formData, "collateralTitle"), url: field(formData, "collateralUrl").trim() };
}

function collateralProblems(formData: FormData): Readonly<Record<string, string>> {
  const { title, url } = collateralBody(formData);
  if (title.trim() === "" && url === "") return {};
  const checked = addCollateralSchema.omit({ clientOrgId: true }).safeParse({ ...collateralBody(formData), title: title.trim() });
  return checked.success ? {} : fieldErrors(checked.error, { title: "Link title", url: "Link address" }, { title: "collateralTitle", url: "collateralUrl" });
}

export async function addClientAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const timeZone = field(formData, "timeZone").trim();
  const profileProblems = clientProfileSchema.safeParse(profileBody(formData));
  return runAction({
    formData,
    fieldNames: ["name", "timeZone", ...PROFILE_FIELDS, "collateralTitle", "collateralUrl"],
    precheck: () => ({ ...(profileProblems.success ? {} : fieldErrors(profileProblems.error, PROFILE_LABELS)), ...collateralProblems(formData) }),
    build: () => ({ kind: "client", name: field(formData, "name"), ...(timeZone === "" ? {} : { timeZone }), profile: profileBody(formData), confirmDuplicate: field(formData, "confirmDuplicate") === "on" }),
    schema: createOrganisationSchema,
    labels: { name: "Name", timeZone: "Time zone" },
    errorFields: { "duplicate-name": "confirmDuplicate" },
    messages: { "duplicate-name": "A client with that name already exists." },
    perform: async (deps, actor, input) => {
      const created = await createOrganisation(deps, actor, input);
      const link = collateralBody(formData);
      if (link.url !== "") await addCollateral(deps, actor, { clientOrgId: created.id, ...link, title: link.title.trim() });
      return { redirectTo: `/fynix/clients/${created.publicRef}` };
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

export async function updateProfileAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const caseStudies = field(formData, "caseStudies").trim();
  return runAction({
    formData,
    fieldNames: PROFILE_FIELDS,
    build: () => ({ clientOrgId: field(formData, "clientOrgId"), ...profileBody(formData), caseStudies: caseStudies === "" ? null : caseStudies }),
    schema: updateClientProfileSchema,
    labels: PROFILE_LABELS,
    perform: async (deps, actor, input) => {
      await updateClientProfile(deps, actor, input);
    },
  });
}

export async function addCollateralAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: ["title", "url"],
    build: () => ({ clientOrgId: field(formData, "clientOrgId"), kind: "link", title: field(formData, "title"), url: field(formData, "url").trim() }),
    schema: addCollateralSchema,
    labels: { title: "Title", url: "Address" },
    perform: async (deps, actor, input) => {
      await addCollateral(deps, actor, input);
    },
  });
}

const collateralInput = z.object({ collateralId: uuidSchema }).strict();

export async function removeCollateralAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: [],
    build: () => ({ collateralId: field(formData, "collateralId") }),
    schema: collateralInput,
    labels: {},
    messages: { "invalid-transition": "That link is removed already." },
    perform: async (deps, actor, input) => {
      await removeCollateral(deps, actor, collateralInput.parse(input).collateralId);
    },
  });
}

/** Changes a person's name, job title and phone. A blank phone clears it. */
export async function updatePersonAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const phone = field(formData, "phone").trim();
  const memberId = field(formData, "memberId");
  return runAction({
    formData,
    fieldNames: ["displayName", "jobTitle", "phone"],
    build: () => ({ displayName: field(formData, "displayName"), jobTitle: field(formData, "jobTitle"), phone: phone === "" ? null : phone }),
    schema: memberDetailsSchema,
    labels: { displayName: "Name", jobTitle: "Job title", phone: "Phone" },
    perform: async (deps, actor, input) => {
      await updateMemberDetails(deps, actor, memberId, input);
    },
  });
}

const memberInput = z.object({ memberId: uuidSchema }).strict();

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
    fieldNames: ["organisationId", "name", "jobTitle", "email", "phone", "role", "alias"],
    build: () => {
      const phone = field(formData, "phone").trim();
      const alias = field(formData, "alias").trim();
      return {
        organisationId: field(formData, "organisationId"),
        name: field(formData, "name"),
        jobTitle: field(formData, "jobTitle"),
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
