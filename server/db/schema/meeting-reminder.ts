import { sql } from "drizzle-orm";
import { check, foreignKey, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { meeting } from "./meeting";

export const MEETING_REMINDER_KINDS = ["prospect_24h", "prospect_1h", "nudge_end", "nudge_24h"] as const;
export type MeetingReminderKind = (typeof MEETING_REMINDER_KINDS)[number];

/**
 * When the emails that depend on the meeting's time are due: the prospect a day and an hour before, and the people who ran it a nudge when it ends
 * and again a day later if no outcome is recorded. A trigger writes the four rows when a meeting is booked and moves the unsent ones when the meeting
 * is postponed (a postponement also re-arms the ones already sent, since they were for the old time). No runtime role touches the table: the sweep
 * claims rows through a SECURITY DEFINER function that stamps `sent_at` in the same call.
 */
export const meetingReminder = pgTable(
  "meeting_reminder",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id").notNull(),
    kind: text("kind").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("meeting_reminder_meeting_kind_unique").on(table.meetingId, table.kind),
    foreignKey({ name: "meeting_reminder_meeting_fk", columns: [table.meetingId], foreignColumns: [meeting.id] }).onDelete("cascade"),
    check("meeting_reminder_kind_check", sql`${table.kind} IN ('prospect_24h', 'prospect_1h', 'nudge_end', 'nudge_24h')`),
  ],
);
