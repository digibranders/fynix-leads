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
    // Null until a host adds a real link: Meet codes cannot be invented, only issued by Google.
    googleMeetUrl: text("google_meet_url"),
    // The Google Meet space behind the link (phase 6). Never granted to a tenant: only the join import reads it, through a database function.
    googleSpaceId: text("google_space_id"),
    // The calendar file's SEQUENCE. A trigger raises it when the meeting moves or is cancelled, so every path that changes a meeting keeps it rising.
    icsSequence: integer("ics_sequence").notNull().default(0),
    // When the join record was read from the room; null until it has been, so it is read once.
    joinImportedAt: timestamp("join_imported_at", { withTimezone: true }),
    // When the first invited person accepted, and the time by which someone must (24 hours before the meeting). Both stay empty until booking is built (step E).
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    replyDueAt: timestamp("reply_due_at", { withTimezone: true }),
    outcome: text("outcome").notNull().default("scheduled"),
    notes: text("notes"),
    heldAt: timestamp("held_at", { withTimezone: true }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }),
    recordedByUserId: uuid("recorded_by_user_id"),
    // Which side recorded the outcome first: the client, an agency, the coordinator (the agency with no parent) or Fynix. Never a person's name.
    recordedByRole: text("recorded_by_role"),
    // A recorded outcome the other side disputes inside 48 hours (phase 4). Fynix decides; the columns stay as the record of it.
    contestedAt: timestamp("contested_at", { withTimezone: true }),
    contestNote: text("contest_note"),
    contestedByRole: text("contested_by_role"),
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
    check("meeting_recorded_by_role_check", sql`${table.recordedByRole} IS NULL OR ${table.recordedByRole} IN ('client', 'agency', 'coordinator', 'fynix')`),
    check("meeting_contested_by_role_check", sql`${table.contestedByRole} IS NULL OR ${table.contestedByRole} IN ('client', 'agency', 'coordinator')`),
    check("meeting_contest_note_length", sql`${table.contestNote} IS NULL OR char_length(btrim(${table.contestNote})) BETWEEN 1 AND 1000`),
    check("meeting_ics_sequence_not_negative", sql`${table.icsSequence} >= 0`),
    check("meeting_public_ref_format", sql`${table.publicRef} ~ '^MTG-[0-9A-HJKMNP-TV-Z]{4}$'`),
    check(
      "meeting_outcome_check",
      sql`${table.outcome} IN ('scheduled', 'held', 'client_no_show', 'prospect_no_show', 'rescheduled', 'cancelled')`,
    ),
  ],
);
