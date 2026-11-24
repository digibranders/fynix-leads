import { z } from "zod";
import { CAMPAIGN_STATUSES } from "@/lib/domain/campaign-status";
import { MEETING_MINUTES_MAX, MEETING_MINUTES_MIN, isIanaTimeZone } from "@/lib/domain/campaign-settings";

/**
 * What a Fynix admin may send to the domain services, parsed at the boundary: every service takes `unknown` and parses it
 * here, so a form, a script and a test all meet the same rules. Text is trimmed, bounded, and never empty where a name is
 * required. A `DomainError("invalid-input")` is thrown with the first problem's path, never its value.
 */
const name = (max: number) => z.string().trim().min(1, "is required").max(max, `must be at most ${max} characters`);
const optionalText = (max: number) => z.string().trim().max(max, `must be at most ${max} characters`);
const list = z.array(name(80)).max(30, "must have at most 30 entries");
const count = z.number().int().min(0).max(1_000_000);

/** An IANA zone such as `Europe/London`. Trimmed, then checked against the runtime's time zone database (lib/domain/campaign-settings.ts). */
export const timeZoneSchema = z.string().trim().refine(isIanaTimeZone, "must be an IANA time zone such as Europe/London");

/** The profile Fynix takes for a client: how it is introduced to prospects, what it offers, what sets it apart, and its case studies. */
const profileFields = {
  introduction: name(2000),
  services: name(2000),
  differentiator: name(1000),
  caseStudies: optionalText(4000).nullable().optional(),
};
export const clientProfileSchema = z.object(profileFields).strict();
export type ClientProfileInput = z.infer<typeof clientProfileSchema>;

export const createOrganisationSchema = z
  .object({
    kind: z.enum(["client", "agency"]),
    name: name(120),
    /** Optional and for a client only: it defaults to the name (the brand and the client are one thing since phase 1). */
    brandName: name(80).optional(),
    timeZone: timeZoneSchema.optional(),
    /** A client's profile, taken when it is added. */
    profile: clientProfileSchema.optional(),
    /** Set after the screen warned that a company of that name exists. */
    confirmDuplicate: z.boolean().optional(),
  })
  .strict()
  .refine((input) => input.kind === "client" || (input.brandName === undefined && input.profile === undefined), { path: ["kind"], message: "a brand name and a profile are for a client only" });
export type CreateOrganisationInput = z.infer<typeof createOrganisationSchema>;

export const updateOrganisationSchema = z
  .object({ name: name(120).optional(), brandName: name(80).optional(), timeZone: timeZoneSchema.nullable().optional() })
  .strict()
  .refine((input) => input.name !== undefined || input.brandName !== undefined || input.timeZone !== undefined, { message: "must change something" });
export type UpdateOrganisationInput = z.infer<typeof updateOrganisationSchema>;

export const updateClientProfileSchema = z.object({ clientOrgId: z.uuid(), ...profileFields }).strict();
export type UpdateClientProfileInput = z.infer<typeof updateClientProfileSchema>;

/** A link now; an uploaded file needs the scanned upload route, which is not wired to this screen yet. */
export const addCollateralSchema = z
  .object({ clientOrgId: z.uuid(), kind: z.literal("link"), title: name(160), url: z.url({ protocol: /^https?$/ }).max(2000) })
  .strict();
export type AddCollateralInput = z.infer<typeof addCollateralSchema>;

const meetingMinutes = z.number().int().min(MEETING_MINUTES_MIN).max(MEETING_MINUTES_MAX);

const campaignRequired = {
  name: name(120),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  monthlyTarget: count,
  totalTarget: count,
};
const campaignOptional = {
  geography: optionalText(200),
  industries: list,
  companySize: optionalText(100),
  icp: optionalText(4000),
  jobTitles: list,
  seniority: optionalText(100),
  technologies: list,
  bantBudget: optionalText(1000),
  bantAuthority: optionalText(1000),
  bantNeed: optionalText(1000),
  bantTimeline: optionalText(1000),
  instructions: optionalText(4000),
  /** Fynix only: no tenant role can read it. */
  internalNotes: optionalText(4000).nullable(),
  /** The time zone counting uses, and the default meeting length. The database defaults are Europe/London and 30. */
  timeZone: timeZoneSchema,
  meetingMinutes,
};

export const createCampaignSchema = z
  .object({ clientOrgId: z.uuid(), agencyOrgId: z.uuid(), ...campaignRequired, ...z.object(campaignOptional).partial().shape })
  .strict()
  .refine((input) => input.endDate >= input.startDate, { path: ["endDate"], message: "must not be before the start date" });
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

/** The client and the agency are fixed when a campaign is created: changing one later would orphan its leads (phase 2) and the aliases the client has seen. */
export const updateCampaignSchema = z
  .object({ ...z.object(campaignRequired).partial().shape, ...z.object(campaignOptional).partial().shape, status: z.enum(CAMPAIGN_STATUSES).optional() })
  .strict()
  .refine((input) => Object.keys(input).length > 0, { message: "must change something" });
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export const closeCampaignSchema = z.object({ campaignId: z.uuid(), note: optionalText(500).default("") }).strict();
export type CloseCampaignInput = z.input<typeof closeCampaignSchema>;

export const publishTermsSchema = z.object({ party: z.enum(["client", "agency", "fynix"]), title: name(160), body: name(60_000) }).strict();
export type PublishTermsInput = z.infer<typeof publishTermsSchema>;

/** A phone number as typed: digits, spaces and the usual punctuation. Not normalised, because Fynix and the client read it as written. */
export const phoneSchema = z.string().trim().min(5, "must be at least 5 characters").max(40, "must be at most 40 characters").regex(/^[0-9+()\-. ]+$/, "may hold digits, spaces and + ( ) - . only");
/** Fynix people are invited as `admin` (can change set-up) or `staff` (read it and work leads); stored as `manager` and `member`. */
const inviteRole = z.enum(["member", "manager", "admin", "staff"]).default("member").transform((role) => (role === "admin" ? "manager" : role === "staff" ? "member" : role));

const inviteFields = {
  email: z.email().max(254),
  name: name(120),
  jobTitle: name(120),
  phone: phoneSchema.optional(),
  role: inviteRole,
  /** The Fynix name the client sees for an agency user. Defaults to the person's name; not allowed for a client or Fynix. */
  alias: name(60).optional(),
};
export const issueInviteSchema = z.object({ organisationId: z.uuid(), ...inviteFields }).strict();
export type IssueInviteInput = z.input<typeof issueInviteSchema>;

export const memberDetailsSchema = z
  .object({ displayName: name(120).optional(), jobTitle: name(120).optional(), phone: phoneSchema.nullable().optional() })
  .strict()
  .refine((input) => input.displayName !== undefined || input.jobTitle !== undefined || input.phone !== undefined, { message: "must change something" });
export type MemberDetailsInput = z.infer<typeof memberDetailsSchema>;

/** The profile page: a person's own name, job title and phone. All three are sent every time; a blank phone is `null`. */
export const ownProfileSchema = z.object({ displayName: name(120), jobTitle: name(120), phone: phoneSchema.nullable() }).strict();
export type OwnProfileInput = z.infer<typeof ownProfileSchema>;

export const aliasSchema = z.string().trim().min(2, "must be at least 2 characters").max(60, "must be at most 60 characters");
export const displayNameSchema = name(120);
export const uuidSchema = z.uuid();

export const createSupplierSchema = z.object({ name: name(120) }).strict();
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const createPartnerAgencySchema = z.object({ supplierId: z.uuid(), name: name(120) }).strict();
export type CreatePartnerAgencyInput = z.infer<typeof createPartnerAgencySchema>;

export const publishAgreementSchema = z
  .object({
    campaignId: z.uuid(),
    monthlyTarget: count,
    totalTarget: count,
    /** How long after a meeting the client may dispute it. */
    disputeWindowHours: z.number().int().min(1).max(720).default(48),
    /** The no-show and cancellation rules, in words. */
    rules: optionalText(4000).default(""),
    notes: optionalText(2000).default(""),
  })
  .strict();
export type PublishAgreementInput = z.input<typeof publishAgreementSchema>;

export const recordAgreementAcceptanceSchema = z
  .object({
    agreementId: z.uuid(),
    userId: z.uuid(),
    /** Where the signer accepted from. A Fynix admin recording it for them says so. */
    networkAddress: name(64).default("recorded by Fynix"),
  })
  .strict();
export type RecordAgreementAcceptanceInput = z.input<typeof recordAgreementAcceptanceSchema>;

export const setCampaignShareSchema = z.object({ campaignId: z.uuid(), agencyOrgId: z.uuid(), monthlyShare: count }).strict();
export type SetCampaignShareInput = z.infer<typeof setCampaignShareSchema>;

export const removeCampaignShareSchema = z.object({ campaignId: z.uuid(), agencyOrgId: z.uuid() }).strict();
export type RemoveCampaignShareInput = z.infer<typeof removeCampaignShareSchema>;

export const addCampaignHostSchema = z.object({ campaignId: z.uuid(), memberId: z.uuid(), jobTitle: name(120) }).strict();
export type AddCampaignHostInput = z.infer<typeof addCampaignHostSchema>;

export const deactivateCampaignHostSchema = z.object({ campaignId: z.uuid(), memberId: z.uuid() }).strict();
export type DeactivateCampaignHostInput = z.infer<typeof deactivateCampaignHostSchema>;

const hoursWindow = z.object({ weekday: z.number().int(), startMinute: z.number().int(), endMinute: z.number().int() }).strict();
/** A whole weekly set, replacing the old one. Ranges and overlaps are checked by `findHoursProblem` (lib/domain/weekly-hours.ts) so the message names the rule. */
export const setHostHoursSchema = z.object({ memberId: z.uuid(), timeZone: timeZoneSchema, hours: z.array(hoursWindow).max(70, "must have at most 70 windows") }).strict();
export type SetHostHoursInput = z.input<typeof setHostHoursSchema>;

/** An instant with an offset or Z, such as `2027-01-04T09:00:00Z` or `2027-01-04T10:00:00+01:00`: a time with no offset is ambiguous, so it is refused. */
const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
export const addHostBlockSchema = z
  .object({ memberId: z.uuid(), startsAt: instant, endsAt: instant, note: optionalText(500).default("") })
  .strict()
  // Zod 4 still runs an object level refine after a field failed, with that field unparsed, so it waits for a clean parse.
  .refine((input) => input.endsAt.getTime() > input.startsAt.getTime(), { path: ["endsAt"], message: "must be after the start", when: (payload) => payload.issues.length === 0 });
export type AddHostBlockInput = z.input<typeof addHostBlockSchema>;

export const createAliasIdentitySchema = z
  .object({
    /** The client the alias is for, chosen from the clients of the campaigns the agency sees. */
    clientOrgId: z.uuid(),
    displayName: name(100),
    jobTitle: name(100),
    aliasEmail: z.string().trim().email("must be a valid email address").toLowerCase(),
  })
  .strict();
export type CreateAliasIdentityInput = z.infer<typeof createAliasIdentitySchema>;

/** Editing an alias changes its client, name or title; the mailbox stays, because a new mailbox would need a new code. */
export const updateAliasIdentitySchema = z
  .object({ publicRef: z.string().trim().regex(/^ALI-[0-9A-HJKMNP-TV-Z]{4}$/, "must be an ALI reference"), clientOrgId: z.uuid().optional(), displayName: name(100).optional(), jobTitle: name(100).optional() })
  .strict()
  .refine((input) => input.clientOrgId !== undefined || input.displayName !== undefined || input.jobTitle !== undefined, { message: "must change something" });
export type UpdateAliasIdentityInput = z.infer<typeof updateAliasIdentitySchema>;

export const retireAliasIdentitySchema = z.object({ publicRef: z.string().trim().regex(/^ALI-[0-9A-HJKMNP-TV-Z]{4}$/, "must be an ALI reference") }).strict();
export type RetireAliasIdentityInput = z.infer<typeof retireAliasIdentitySchema>;

/** A client manager adds a host from its own organisation's people, or pauses one. */
export const tenantHostSchema = z.object({ campaignId: z.uuid(), memberId: z.uuid() }).strict();
export const tenantAddHostSchema = z.object({ campaignId: z.uuid(), memberId: z.uuid(), jobTitle: name(120) }).strict();
export type TenantAddHostInput = z.input<typeof tenantAddHostSchema>;

/** A host's own weekly hours and a blocked time. The person is the signed-in member, so no member id is taken. */
export const ownHoursSchema = z.object({ timeZone: timeZoneSchema, hours: z.array(hoursWindow).max(70, "must have at most 70 windows") }).strict();
export type OwnHoursInput = z.input<typeof ownHoursSchema>;
export const ownBlockSchema = z
  .object({ startsAt: instant, endsAt: instant, note: optionalText(500).default("") })
  .strict()
  .refine((input) => input.endsAt.getTime() > input.startsAt.getTime(), { path: ["endsAt"], message: "must be after the start", when: (payload) => payload.issues.length === 0 });
export type OwnBlockInput = z.input<typeof ownBlockSchema>;

export const verifyAliasCodeSchema = z
  .object({
    publicRef: z.string().trim().regex(/^ALI-[0-9A-HJKMNP-TV-Z]{4}$/, "must be an ALI reference"),
    code: z.string().trim().regex(/^\d{6}$/, "must be a 6-digit code"),
  })
  .strict();
export type VerifyAliasCodeInput = z.infer<typeof verifyAliasCodeSchema>;

export const createSupplierPartnerAgencySchema = z
  .object({
    name: name(120),
  })
  .strict();
export type CreateSupplierPartnerAgencyInput = z.infer<typeof createSupplierPartnerAgencySchema>;

export const acceptTenantAgreementSchema = z
  .object({
    agreementId: z.uuid(),
    networkAddress: name(64).default("tenant web"),
  })
  .strict();
export type AcceptTenantAgreementInput = z.input<typeof acceptTenantAgreementSchema>;

export const addExclusionSchema = z
  .object({
    clientOrgId: z.uuid(),
    kind: z.enum(["domain", "email", "company"]),
    value: name(255),
    reason: optionalText(500).optional(),
  })
  .strict();
export type AddExclusionInput = z.infer<typeof addExclusionSchema>;

export const removeExclusionSchema = z
  .object({
    exclusionId: z.uuid(),
  })
  .strict();
export type RemoveExclusionInput = z.infer<typeof removeExclusionSchema>;

export const submitLeadSchema = z
  .object({
    campaignId: z.uuid(),
    aliasIdentityId: z.uuid(),
    hostMemberId: z.uuid(),
    prospectName: name(120),
    prospectTitle: name(120),
    prospectCompany: name(120),
    prospectDomain: name(255),
    prospectLinkedinUrl: name(255),
    prospectEmail: z.string().trim().email("must be a valid email address").toLowerCase(),
    prospectPhone: optionalText(40).optional(),
    prospectNotes: optionalText(2000).optional(),
    bantBudget: name(500),
    bantAuthority: name(500),
    bantNeed: name(500),
    bantTimeline: name(500),
    proposedTimes: z.array(instant).min(1, "at least one proposed meeting time is required").max(3, "at most 3 proposed meeting times"),
  })
  .strict();
export type SubmitLeadInput = z.input<typeof submitLeadSchema>;
export type SubmitLeadParsed = z.output<typeof submitLeadSchema>;

/**
 * A draft needs a campaign and a prospect name; everything else may be empty and is checked in full when the draft is submitted. The
 * optional text fields are trimmed so a field that was cleared becomes an empty string, which is how a draft stores "not filled in yet".
 */
const draftText = (max: number) => z.string().trim().max(max, `must be at most ${max} characters`);
const draftFields = {
  aliasIdentityId: z.uuid().nullable().optional(),
  hostMemberId: z.uuid().nullable().optional(),
  prospectName: name(120),
  prospectTitle: draftText(120).optional(),
  prospectCompany: draftText(120).optional(),
  prospectDomain: draftText(255).optional(),
  prospectLinkedinUrl: draftText(255).optional(),
  prospectEmail: z.union([z.literal(""), z.string().trim().email("must be a valid email address").toLowerCase()]).optional(),
  prospectPhone: optionalText(40).optional(),
  prospectNotes: optionalText(2000).optional(),
  bantBudget: draftText(500).optional(),
  bantAuthority: draftText(500).optional(),
  bantNeed: draftText(500).optional(),
  bantTimeline: draftText(500).optional(),
  proposedTimes: z.array(instant).max(3, "at most 3 proposed meeting times").optional(),
};
export const saveDraftSchema = z.object({ campaignId: z.uuid(), ...draftFields }).strict();
export type SaveDraftInput = z.input<typeof saveDraftSchema>;
export const updateDraftSchema = z.object({ leadId: z.uuid(), ...draftFields }).strict();
export type UpdateDraftInput = z.input<typeof updateDraftSchema>;
export const draftIdSchema = z.object({ leadId: z.uuid() }).strict();

/** Withdrawing a submitted lead carries an optional note for the history. */
export const withdrawLeadSchema = z.object({ leadId: z.uuid(), note: optionalText(1000).optional() }).strict();

const proposedTimesList = z.array(instant).min(1, "at least one new time is required").max(3, "at most 3 new times");
export const proposePostponementSchema = z.object({ meetingId: z.uuid(), proposedTimes: proposedTimesList }).strict();
export const pickPostponementSchema = z.object({ rescheduleId: z.uuid(), pickedTime: instant }).strict();

const contestNote = z.string().trim().min(5, "must be at least 5 characters").max(1000, "must be at most 1000 characters");
export const contestOutcomeSchema = z.object({ meetingId: z.uuid(), note: contestNote }).strict();
export const requestRejectionReviewSchema = z.object({ leadId: z.uuid(), note: contestNote }).strict();
export const markRejectionReviewedSchema = z.object({ leadId: z.uuid(), note: contestNote.optional() }).strict();
export const decideContestSchema = z.object({ leadId: z.uuid(), outcome: z.enum(["held", "client_no_show", "prospect_no_show"]), note: contestNote }).strict();

/** Fynix corrects what a lead says about the prospect, with a note. Only the fields named are changed. */
export const correctLeadSchema = z
  .object({
    leadId: z.uuid(),
    note: contestNote,
    prospectName: name(120).optional(),
    prospectTitle: name(120).optional(),
    prospectCompany: name(120).optional(),
    prospectDomain: name(255).optional(),
    prospectLinkedinUrl: name(255).optional(),
    prospectEmail: z.string().trim().email("must be a valid email address").toLowerCase().optional(),
    prospectPhone: optionalText(40).nullable().optional(),
    prospectNotes: optionalText(2000).nullable().optional(),
    bantBudget: name(500).optional(),
    bantAuthority: name(500).optional(),
    bantNeed: name(500).optional(),
    bantTimeline: name(500).optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).some((key) => key !== "leadId" && key !== "note"), { message: "must change something" });

/** Fynix answers for the client: pick a time, reject before the meeting, or accept or reject after it. Each carries the note. */
export const answerForClientSchema = z
  .object({
    leadId: z.uuid(),
    answer: z.enum(["pick_time", "reject_before", "accept", "reject"]),
    selectedMeetingTime: instant.optional(),
    note: contestNote,
  })
  .strict()
  .refine((input) => input.answer !== "pick_time" || input.selectedMeetingTime !== undefined, { path: ["selectedMeetingTime"], message: "is required to pick a time" });
export const markLostSchema = z.object({ leadId: z.uuid(), note: contestNote }).strict();
export const approveOverShareSchema = z.object({ leadId: z.uuid(), note: contestNote }).strict();

/** The note that goes with every accept and every reject of a lead: required both ways (lead flow decision, 2026-11-24). */
export const DECISION_NOTE_MIN = 5;
export const DECISION_NOTE_MAX = 1000;
const decisionNote = z.string().trim().min(DECISION_NOTE_MIN, `must be at least ${DECISION_NOTE_MIN} characters`).max(DECISION_NOTE_MAX, `must be at most ${DECISION_NOTE_MAX} characters`);

export const clientReviewLeadSchema = z
  .object({
    leadId: z.uuid(),
    action: z.enum(["accept", "propose_times", "decline"]),
    selectedMeetingTime: instant.optional(),
    proposedTimes: z.array(instant).max(3).optional(),
    declineReason: decisionNote.optional(),
  })
  .strict()
  .refine(
    (input) => {
      if (input.action === "accept") return input.selectedMeetingTime !== undefined;
      if (input.action === "propose_times") return (input.proposedTimes?.length ?? 0) > 0;
      if (input.action === "decline") return input.declineReason !== undefined;
      return true;
    },
    { message: "action requirements not met (accept requires selected time, decline requires reason, propose requires times)" },
  );
export type ClientReviewLeadInput = z.input<typeof clientReviewLeadSchema>;

/** The client's answer after the meeting. */
export const decideLeadSchema = z.object({ leadId: z.uuid(), decision: z.enum(["accept", "reject"]), note: decisionNote }).strict();
export type DecideLeadInput = z.infer<typeof decideLeadSchema>;

/** Fynix changes a rejection to accepted, with its own note. */
export const overturnRejectionSchema = z.object({ leadId: z.uuid(), note: decisionNote }).strict();
export type OverturnRejectionInput = z.infer<typeof overturnRejectionSchema>;

export const disputeLeadSchema = z
  .object({
    leadId: z.uuid(),
    disputeReason: z.string().trim().min(5, "must be at least 5 characters").max(1000),
  })
  .strict();
export type DisputeLeadInput = z.infer<typeof disputeLeadSchema>;

export const resolveDisputeSchema = z
  .object({
    leadId: z.uuid(),
    resolution: z.enum(["upheld", "rejected"]),
    note: optionalText(500).optional(),
  })
  .strict();
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;

export const recordMeetingOutcomeSchema = z
  .object({
    meetingId: z.uuid(),
    outcome: z.enum(["held", "client_no_show", "prospect_no_show"]),
    notes: optionalText(2000).optional(),
  })
  .strict();
export type RecordMeetingOutcomeInput = z.infer<typeof recordMeetingOutcomeSchema>;

export const getOrCreateConversationSchema = z
  .object({
    campaignId: z.uuid(),
    leadId: z.uuid().optional(),
    side: z.enum(["client_fynix", "supplier_fynix", "supplier_agency"]),
    clientOrgId: z.uuid().optional(),
    supplierOrgId: z.uuid().optional(),
    agencyOrgId: z.uuid().optional(),
    subject: optionalText(200).optional(),
  })
  .strict();
export type GetOrCreateConversationInput = z.infer<typeof getOrCreateConversationSchema>;

export const postMessageSchema = z
  .object({
    conversationId: z.uuid(),
    body: z.string().trim().min(1, "message body is required").max(10_000, "must be at most 10000 characters"),
  })
  .strict();
export type PostMessageInput = z.infer<typeof postMessageSchema>;

export const forwardMessageSchema = z
  .object({
    messageId: z.uuid(),
    targetConversationId: z.uuid(),
  })
  .strict();
export type ForwardMessageInput = z.infer<typeof forwardMessageSchema>;

export const markConversationReadSchema = z.object({ conversationId: z.uuid() }).strict();

export const markNotificationReadSchema = z
  .object({
    notificationId: z.uuid(),
  })
  .strict();
export type MarkNotificationReadInput = z.infer<typeof markNotificationReadSchema>;

export const createGroupSchema = z
  .object({
    name: z.string().trim().min(1, "a group needs a name").max(80, "must be at most 80 characters"),
    memberIds: z.array(z.uuid()).max(200, "a group has at most 200 people"),
  })
  .strict();

export const directChatSchema = z.object({ userId: z.uuid() }).strict();

export const groupMembersSchema = z.object({ groupId: z.uuid(), memberIds: z.array(z.uuid()).min(1, "choose at least one person").max(200) }).strict();
export const groupMemberSchema = z.object({ groupId: z.uuid(), userId: z.uuid() }).strict();
export const renameGroupSchema = z.object({ groupId: z.uuid(), name: z.string().trim().min(1, "a group needs a name").max(80, "must be at most 80 characters") }).strict();
export const groupIdSchema = z.object({ groupId: z.uuid() }).strict();

export const hostAvailabilitySchema = z.object({ hostMemberId: z.uuid(), campaignId: z.uuid() }).strict();
export const checkProposedTimesSchema = z.object({ hostMemberId: z.uuid(), campaignId: z.uuid(), proposedTimes: z.array(instant).max(3) }).strict();
