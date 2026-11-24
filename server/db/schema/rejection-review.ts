import { sql } from "drizzle-orm";
import { check, foreignKey, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { lead } from "./lead";

/**
 * The coordinator's request that Fynix look again at a rejection after the meeting (lead flow decision, "Review of a rejection"): one per lead,
 * with a note, within 48 hours of the rejection. Fynix reads the list and resolves a request by changing the rejection or by marking it reviewed.
 * No client role reads it: the client never learns that the supply side asked.
 */
export const rejectionReview = pgTable(
  "rejection_review",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id").notNull(),
    requestedByUserId: uuid("requested_by_user_id").notNull(),
    note: text("note").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    unique("rejection_review_lead_unique").on(table.leadId),
    foreignKey({ name: "rejection_review_lead_fk", columns: [table.leadId], foreignColumns: [lead.id] }).onDelete("cascade"),
    foreignKey({ name: "rejection_review_user_fk", columns: [table.requestedByUserId], foreignColumns: [user.id] }),
    check("rejection_review_status_check", sql`${table.status} IN ('open', 'resolved')`),
    check("rejection_review_note_length", sql`char_length(btrim(${table.note})) BETWEEN 5 AND 1000`),
    check("rejection_review_resolved_check", sql`(${table.status} = 'open' AND ${table.resolvedAt} IS NULL) OR (${table.status} = 'resolved' AND ${table.resolvedAt} IS NOT NULL)`),
  ],
);
