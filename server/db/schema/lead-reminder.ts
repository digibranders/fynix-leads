import { sql } from "drizzle-orm";
import { check, foreignKey, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { lead } from "./lead";

export const LEAD_REMINDER_KINDS = ["12h", "24h", "36h"] as const;
export type LeadReminderKind = (typeof LEAD_REMINDER_KINDS)[number];

/**
 * When the client is reminded to accept or reject a lead after "meeting finished" (lead flow decision: every 12 hours, at 12, 24 and 36
 * hours, before the 48 hour automatic acceptance). A database trigger writes the three rows when the lead reaches `awaiting_decision`.
 * No runtime role touches the table: the sweep reads and stamps it through SECURITY DEFINER functions (migration 0065).
 */
export const leadReminder = pgTable(
  "lead_reminder",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id").notNull(),
    kind: text("kind").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    // The email half of the reminder has its own stamp (phase 6), so the notice in the app is unaffected by whether email is on.
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("lead_reminder_lead_kind_unique").on(table.leadId, table.kind),
    foreignKey({ name: "lead_reminder_lead_fk", columns: [table.leadId], foreignColumns: [lead.id] }).onDelete("cascade"),
    check("lead_reminder_kind_check", sql`${table.kind} IN ('12h', '24h', '36h')`),
  ],
);
