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

export const createOrganisationSchema = z
  .object({
    kind: z.enum(["client", "agency"]),
    name: name(120),
    /** What an agency sees of a client. Required for a client; an agency has none. */
    brandName: name(80).optional(),
  })
  .strict()
  .refine((input) => (input.kind === "client") === (input.brandName !== undefined), { path: ["brandName"], message: "is required for a client and not allowed for an agency" });
export type CreateOrganisationInput = z.infer<typeof createOrganisationSchema>;

export const updateOrganisationSchema = z
  .object({ name: name(120).optional(), brandName: name(80).optional() })
  .strict()
  .refine((input) => input.name !== undefined || input.brandName !== undefined, { message: "must change something" });
export type UpdateOrganisationInput = z.infer<typeof updateOrganisationSchema>;

/** An IANA zone such as `Europe/London`. Trimmed, then checked against the runtime's time zone database (lib/domain/campaign-settings.ts). */
export const timeZoneSchema = z.string().trim().refine(isIanaTimeZone, "must be an IANA time zone such as Europe/London");
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

export const publishTermsSchema = z.object({ party: z.enum(["client", "agency", "fynix"]), title: name(160), body: name(60_000) }).strict();
export type PublishTermsInput = z.infer<typeof publishTermsSchema>;

export const issueInviteSchema = z
  .object({
    organisationId: z.uuid(),
    email: z.email().max(254),
    name: name(120),
    role: z.enum(["member", "manager"]).default("member"),
    /** The Fynix name the client sees for an agency user. Required for an agency, not allowed for a client. */
    alias: name(60).optional(),
  })
  .strict();
export type IssueInviteInput = z.input<typeof issueInviteSchema>;

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
    party: z.enum(["client", "supplier"]),
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
