import { sql } from "drizzle-orm";
import { check, foreignKey, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organisation } from "./organisation";

/**
 * Client exclusion list entries (spec v2 section 8.1).
 * Leads matching any exclusion entry for the client are blocked on submission.
 * Supported kinds:
 * - 'domain': matches prospect email domain or company domain (e.g. 'competitor.com')
 * - 'email': matches exact prospect email address (normalized lowercase)
 * - 'company': matches prospect company name (case-insensitive substring/equality)
 */
export const exclusionEntry = pgTable(
  "exclusion_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientOrgId: uuid("client_org_id").notNull(),
    kind: text("kind").notNull(),
    value: text("value").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "exclusion_entry_client_fk",
      columns: [table.clientOrgId],
      foreignColumns: [organisation.id],
    }),
    check("exclusion_entry_kind_check", sql`${table.kind} IN ('domain', 'email', 'company')`),
    check("exclusion_entry_value_length", sql`char_length(btrim(${table.value})) BETWEEN 1 AND 255 AND ${table.value} = btrim(${table.value})`),
    uniqueIndex("exclusion_entry_client_kind_value_unique").on(
      table.clientOrgId,
      table.kind,
      sql`lower(${table.value})`,
    ),
  ],
);
