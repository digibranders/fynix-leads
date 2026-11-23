import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { aliasIdentity } from "./alias-identity";
import { user } from "./auth";
import { campaign } from "./campaign";
import { member } from "./member";
import { organisation } from "./organisation";

export const LEAD_STAGES = [
  "draft",
  "awaiting_client",
  "scheduled",
  "outcome_due",
  "reschedule_needed",
  "held",
  "client_no_show",
  "prospect_no_show",
  "delivered",
  "disputed",
  "declined",
  "withdrawn",
  "lost",
  "rejected",
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];

/**
 * Leads submitted for a campaign (spec v2 section 8).
 * Tracks a prospect from initial submission through client acceptance, meeting, outcome, and 48-hour dispute window.
 */
export const lead = pgTable(
  "lead",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicRef: text("public_ref").notNull(),
    campaignId: uuid("campaign_id").notNull(),
    sourceOrgId: uuid("source_org_id").notNull(),
    submittedByUserId: uuid("submitted_by_user_id").notNull(),
    aliasIdentityId: uuid("alias_identity_id").notNull(),
    hostMemberId: uuid("host_member_id").notNull(),

    // Prospect details
    prospectName: text("prospect_name").notNull(),
    prospectTitle: text("prospect_title").notNull(),
    prospectCompany: text("prospect_company").notNull(),
    prospectDomain: text("prospect_domain").notNull(),
    prospectLinkedinUrl: text("prospect_linkedin_url").notNull(),
    prospectEmail: text("prospect_email").notNull(),
    prospectPhone: text("prospect_phone"),
    prospectNotes: text("prospect_notes"),

    // BANT qualification
    bantBudget: text("bant_budget").notNull(),
    bantAuthority: text("bant_authority").notNull(),
    bantNeed: text("bant_need").notNull(),
    bantTimeline: text("bant_timeline").notNull(),

    // Lifecycle state machine
    stage: text("stage").notNull().default("awaiting_client"),
    declineReason: text("decline_reason"),
    disputeReason: text("dispute_reason"),

    // Proposed and agreed meeting times
    proposedTimes: jsonb("proposed_times").notNull().default(sql`'[]'::jsonb`),
    scheduledMeetingTime: timestamp("scheduled_meeting_time", { withTimezone: true }),

    // Flags
    overShare: boolean("over_share").notNull().default(false),
    duplicateOverride: boolean("duplicate_override").notNull().default(false),

    // Timestamps
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    disputedAt: timestamp("disputed_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("lead_public_ref_unique").on(table.publicRef),
    foreignKey({
      name: "lead_campaign_fk",
      columns: [table.campaignId],
      foreignColumns: [campaign.id],
    }),
    foreignKey({
      name: "lead_source_org_fk",
      columns: [table.sourceOrgId],
      foreignColumns: [organisation.id],
    }),
    foreignKey({
      name: "lead_submitted_by_fk",
      columns: [table.submittedByUserId],
      foreignColumns: [user.id],
    }),
    foreignKey({
      name: "lead_alias_identity_fk",
      columns: [table.aliasIdentityId],
      foreignColumns: [aliasIdentity.id],
    }),
    foreignKey({
      name: "lead_host_member_fk",
      columns: [table.hostMemberId],
      foreignColumns: [member.id],
    }),
    check("lead_public_ref_format", sql`${table.publicRef} ~ '^LD-[0-9A-HJKMNP-TV-Z]{4}$'`),
    check(
      "lead_stage_check",
      sql`${table.stage} IN ('draft', 'awaiting_client', 'scheduled', 'outcome_due', 'reschedule_needed', 'held', 'client_no_show', 'prospect_no_show', 'delivered', 'disputed', 'declined', 'withdrawn', 'lost', 'rejected')`,
    ),
    check("lead_prospect_name_length", sql`char_length(btrim(${table.prospectName})) BETWEEN 1 AND 120 AND ${table.prospectName} = btrim(${table.prospectName})`),
    check("lead_prospect_title_length", sql`char_length(btrim(${table.prospectTitle})) BETWEEN 1 AND 120 AND ${table.prospectTitle} = btrim(${table.prospectTitle})`),
    check("lead_prospect_company_length", sql`char_length(btrim(${table.prospectCompany})) BETWEEN 1 AND 120 AND ${table.prospectCompany} = btrim(${table.prospectCompany})`),
    check("lead_prospect_domain_length", sql`char_length(btrim(${table.prospectDomain})) BETWEEN 1 AND 255 AND ${table.prospectDomain} = lower(btrim(${table.prospectDomain}))`),
    check("lead_prospect_email_check", sql`${table.prospectEmail} = lower(btrim(${table.prospectEmail})) AND ${table.prospectEmail} ~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'`),
  ],
);
