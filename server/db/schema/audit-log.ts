import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Everything Fynix changes, one row per change: who (`actor_user_id` and the database role), what (`action`), to what
 * (`subject_*`) and the public-safe state before and after. Append only: migration 0012 makes UPDATE and DELETE raise for
 * every role including the owner, and no role holds either privilege. A Fynix transaction that writes a domain table
 * without appending a row here fails when it commits (`audit_required`, migration 0012), so the log cannot be forgotten.
 *
 * `actor_user_id` and `actor_role` default from the request scope and the connection, and the policy refuses an insert
 * that names another actor, so a caller cannot write a row in someone else's name.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    /** The transaction that wrote the row; `audit_required` looks for a row with the current transaction's id. */
    txId: bigint("tx_id", { mode: "number" }).notNull().default(sql`txid_current()`),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .default(sql`public.app_current_user_id()`)
      .references(() => user.id, { onDelete: "restrict" }),
    /** The database role that connected, `leads_fynix` for every row in phase 1C. */
    actorRole: text("actor_role").notNull().default(sql`current_user`),
    /** `<table>.<verb>`, for example `invite.issue`. The list of actions lives in server/domain/audit.ts. */
    action: text("action").notNull(),
    subjectTable: text("subject_table").notNull(),
    subjectId: uuid("subject_id").notNull(),
    /** The reference that is safe to show (`CMP-7Q2X`) when the subject has one. */
    subjectRef: text("subject_ref"),
    before: jsonb("before"),
    after: jsonb("after"),
  },
  (table) => [
    check("audit_log_action_format", sql`${table.action} ~ '^[a-z_]+\\.[a-z_]+$'`),
    index("audit_log_tx_idx").on(table.txId),
    index("audit_log_subject_idx").on(table.subjectTable, table.subjectId, table.at),
    index("audit_log_at_idx").on(table.at),
  ],
);
