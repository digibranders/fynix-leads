import { sql } from "drizzle-orm";
import { check, foreignKey, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { campaign } from "./campaign";
import { lead } from "./lead";
import { member } from "./member";

export const MEETING_OUTCOMES = [
  "scheduled",
  "held",
  "client_no_show",
  "prospect_no_show",
  "rescheduled",
  "cancelled",
] as const;

export type MeetingOutcome = (typeof MEETING_OUTCOMES)[number];

export const meeting = pgTable(
  "meeting",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicRef: text("public_ref").notNull(),
    leadId: uuid("lead_id").notNull(),
    campaignId: uuid("campaign_id").notNull(),
    hostMemberId: uuid("host_member_id").notNull(),
    scheduledStartTime: timestamp("scheduled_start_time", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    googleMeetUrl: text("google_meet_url").notNull(),
    outcome: text("outcome").notNull().default("scheduled"),
    notes: text("notes"),
    heldAt: timestamp("held_at", { withTimezone: true }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }),
    recordedByUserId: uuid("recorded_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("meeting_public_ref_unique").on(table.publicRef),
    foreignKey({
      name: "meeting_lead_fk",
      columns: [table.leadId],
      foreignColumns: [lead.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "meeting_campaign_fk",
      columns: [table.campaignId],
      foreignColumns: [campaign.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "meeting_host_member_fk",
      columns: [table.hostMemberId],
      foreignColumns: [member.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "meeting_recorded_by_fk",
      columns: [table.recordedByUserId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
    check("meeting_public_ref_format", sql`${table.publicRef} ~ '^MTG-[0-9A-HJKMNP-TV-Z]{4}$'`),
    check(
      "meeting_outcome_check",
      sql`${table.outcome} IN ('scheduled', 'held', 'client_no_show', 'prospect_no_show', 'rescheduled', 'cancelled')`,
    ),
  ],
);
