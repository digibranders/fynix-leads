import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { meeting } from "./meeting";

/**
 * Who joined a meeting's room, read from Google Meet after the meeting (phase 6): the name as it appeared in the room, when the person joined and left, and
 * how long they stayed. Never an email address or any account id: the importer keeps these fields and drops everything else the room reports. Written
 * only by a SECURITY DEFINER function for the sweep; the client, the agencies and Fynix read the rows of the meetings they can see.
 */
export const meetingJoin = pgTable(
  "meeting_join",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id").notNull(),
    displayName: text("display_name").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({ name: "meeting_join_meeting_fk", columns: [table.meetingId], foreignColumns: [meeting.id] }).onDelete("cascade"),
    index("meeting_join_meeting_idx").on(table.meetingId, table.joinedAt),
    check("meeting_join_name_length", sql`char_length(btrim(${table.displayName})) BETWEEN 1 AND 120`),
    check("meeting_join_duration_not_negative", sql`${table.durationSeconds} >= 0`),
  ],
);
