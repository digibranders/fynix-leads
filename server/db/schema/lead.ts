import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import type { QualificationCheck } from "@/lib/qualification-checks";
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
  "awaiting_decision",
  "accepted",
  "delivered",
  "disputed",
  "declined",
  "withdrawn",
  "lost",
  "rejected",
  "outcome_contested",
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
    // Null only while the lead is a draft (`lead_draft_complete` below).
    aliasIdentityId: uuid("alias_identity_id"),
    hostMemberId: uuid("host_member_id"),

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
    // The checklist the agency ticked when it submitted (migration 0111): one check for each qualification criterion and qualifying question of the campaign, as asked
    // then, and the note the agency wrote, which says why a check was not passed. Written by the source organisation while the lead is a draft.
    qualificationChecks: jsonb("qualification_checks").$type<QualificationCheck[]>().notNull().default([]),
    qualificationNotes: text("qualification_notes").notNull().default(""),

    // Lifecycle state machine
    stage: text("stage").notNull().default("awaiting_client"),
    declineReason: text("decline_reason"),
    disputeReason: text("dispute_reason"),

    // The client's answer after the meeting, or Fynix's when it overturns a rejection (lead flow decision, 2026-11-24).
    // `outcome_recorded_at` is when the meeting's outcome was first recorded; the 48 hour clock of the automatic acceptance starts there.
    outcomeRecordedAt: timestamp("outcome_recorded_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    decisionAt: timestamp("decision_at", { withTimezone: true }),
    decisionByUserId: uuid("decision_by_user_id"),
    decisionSource: text("decision_source"),

    // Proposed and agreed meeting times
    proposedTimes: jsonb("proposed_times").notNull().default(sql`'[]'::jsonb`),
    scheduledMeetingTime: timestamp("scheduled_meeting_time", { withTimezone: true }),

    // False while the lead is a draft or a discarded draft: only the organisation that wrote it (and Fynix) can read it (phase 4, migration 0069).
    released: boolean("released").notNull().default(true),
    // When Fynix looked at a rejection and left it as it was, or changed it (phase 4). Null while the rejection waits for Fynix.
    rejectionReviewedAt: timestamp("rejection_reviewed_at", { withTimezone: true }),

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
    foreignKey({
      name: "lead_decision_by_fk",
      columns: [table.decisionByUserId],
      foreignColumns: [user.id],
    }),
    check("lead_decision_source_check", sql`${table.decisionSource} IS NULL OR ${table.decisionSource} IN ('client', 'auto', 'fynix')`),
    check("lead_decision_note_length", sql`${table.decisionNote} IS NULL OR char_length(btrim(${table.decisionNote})) BETWEEN 1 AND 1000`),
    // A draft, and a discarded draft (never released), may lack a host; every lead the client has seen has one. An alias is no longer asked for (2026-11-27): a lead is sent under the client's name.
    check("lead_draft_complete", sql`${table.stage} = 'draft' OR NOT ${table.released} OR ${table.hostMemberId} IS NOT NULL`),
    check("lead_draft_not_released", sql`${table.stage} <> 'draft' OR NOT ${table.released}`),
    check("lead_public_ref_format", sql`${table.publicRef} ~ '^LD-[0-9A-HJKMNP-TV-Z]{4}$'`),
    check(
      "lead_stage_check",
      sql`${table.stage} IN ('draft', 'awaiting_client', 'awaiting_reply', 'scheduled', 'outcome_due', 'reschedule_needed', 'held', 'client_no_show', 'prospect_no_show', 'awaiting_decision', 'accepted', 'delivered', 'disputed', 'declined', 'withdrawn', 'lost', 'rejected', 'outcome_contested')`,
    ),
    check("lead_prospect_name_length", sql`char_length(btrim(${table.prospectName})) BETWEEN 1 AND 120 AND ${table.prospectName} = btrim(${table.prospectName})`),
    check("lead_prospect_title_length", sql`(NOT ${table.released} AND ${table.prospectTitle} = '') OR (char_length(btrim(${table.prospectTitle})) BETWEEN 1 AND 120 AND ${table.prospectTitle} = btrim(${table.prospectTitle}))`),
    check("lead_prospect_company_length", sql`(NOT ${table.released} AND ${table.prospectCompany} = '') OR (char_length(btrim(${table.prospectCompany})) BETWEEN 1 AND 120 AND ${table.prospectCompany} = btrim(${table.prospectCompany}))`),
    check("lead_prospect_domain_length", sql`(NOT ${table.released} AND ${table.prospectDomain} = '') OR (char_length(btrim(${table.prospectDomain})) BETWEEN 1 AND 255 AND ${table.prospectDomain} = lower(btrim(${table.prospectDomain})))`),
    check("lead_prospect_email_check", sql`(NOT ${table.released} AND ${table.prospectEmail} = '') OR (${table.prospectEmail} = lower(btrim(${table.prospectEmail})) AND ${table.prospectEmail} ~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$')`),
  ],
);
