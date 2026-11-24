import { check, foreignKey, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { lead } from "./lead";

/**
 * Immutable audit history for each lead (spec v2 section 8.2, 17.12).
 * Records stage transitions, client responses, reschedules, dispute filings, and Fynix actions.
 */
export const leadHistory = pgTable(
  "lead_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id").notNull(),
    // Null for a step the system took itself (the automatic acceptance).
    actorUserId: uuid("actor_user_id"),
    actorRole: text("actor_role").notNull(),
    action: text("action").notNull(),
    fromStage: text("from_stage"),
    toStage: text("to_stage"),
    note: text("note"),
    snapshot: jsonb("snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "lead_history_lead_fk",
      columns: [table.leadId],
      foreignColumns: [lead.id],
    }),
    foreignKey({
      name: "lead_history_user_fk",
      columns: [table.actorUserId],
      foreignColumns: [user.id],
    }),
    check("lead_history_role_check", sql`${table.actorRole} IN ('client', 'agency', 'fynix', 'system')`),
  ],
);
