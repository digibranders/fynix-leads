import { sql } from "drizzle-orm";
import { check, foreignKey, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { meeting } from "./meeting";

/**
 * A proposal to move a booked meeting (lead flow decision, "Postponing"): one side offers one to three new times and the other side picks
 * one, as often as needed. The meeting keeps its row and its link; only `scheduled_start_time` changes. `proposed_by_side` is `client` or
 * `supply` (the coordinator and the agencies are one side); `proposed_by_user_id` is for Fynix and is never granted to a tenant, so the supply
 * side cannot learn which client person asked. A new proposal from a side supersedes that side's open one.
 */
export const meetingReschedule = pgTable(
  "meeting_reschedule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id").notNull(),
    proposedBySide: text("proposed_by_side").notNull(),
    proposedByUserId: uuid("proposed_by_user_id").notNull(),
    proposedTimes: jsonb("proposed_times").notNull(),
    status: text("status").notNull().default("open"),
    pickedTime: timestamp("picked_time", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({ name: "meeting_reschedule_meeting_fk", columns: [table.meetingId], foreignColumns: [meeting.id] }).onDelete("cascade"),
    foreignKey({ name: "meeting_reschedule_user_fk", columns: [table.proposedByUserId], foreignColumns: [user.id] }),
    index("meeting_reschedule_meeting_idx").on(table.meetingId, table.createdAt),
    check("meeting_reschedule_side_check", sql`${table.proposedBySide} IN ('client', 'supply')`),
    check("meeting_reschedule_status_check", sql`${table.status} IN ('open', 'accepted', 'superseded')`),
    check("meeting_reschedule_times_check", sql`jsonb_typeof(${table.proposedTimes}) = 'array' AND jsonb_array_length(${table.proposedTimes}) BETWEEN 1 AND 3`),
    check("meeting_reschedule_resolved_check", sql`(${table.status} = 'open' AND ${table.resolvedAt} IS NULL AND ${table.pickedTime} IS NULL) OR (${table.status} <> 'open' AND ${table.resolvedAt} IS NOT NULL)`),
  ],
);
