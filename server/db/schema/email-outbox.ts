import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { emailTemplate, outboxStatus } from "./enums";
import { invite } from "./invite";

/**
 * Every email the app sends, written first and sent after (server/mail/outbox.ts).
 *
 * - `template` and `params` are the content; `subject` and `body` are the stored copy of what was queued, with the link
 *   replaced by a line saying it is not kept. That copy stays as the record.
 * - `link` is the one secret: the reset or invite link. It exists only while the row is `pending` (the check constraint
 *   `email_outbox_link_only_while_pending`) and is cleared the moment the message is sent, fails for good or is cancelled.
 *   A link that has not been sent within a day is cleared by the purge (`purgeExpiredLinks`) and the row fails.
 * - State machine: `pending` (waiting for its turn or for a retry, see `next_attempt_at`), then `sent`, or `failed` after
 *   the last attempt or a permanent refusal, or `cancelled` when the invite it carried was revoked first.
 */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipient: text("recipient").notNull(),
    template: emailTemplate("template").notNull(),
    subject: text("subject").notNull(),
    /** Plain text with the link removed. */
    body: text("body").notNull(),
    status: outboxStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** The values the template needs, never the link. */
    params: jsonb("params").notNull().default(sql`'{}'::jsonb`),
    link: text("link"),
    attempts: integer("attempts").notNull().default(0),
    /** Not offered to a sender before this time: the retry backoff, and the lease while a sender holds the message. */
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    /** A short reason, never the provider's response body, which can echo the recipient. */
    lastError: text("last_error"),
    providerId: text("provider_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /** The invite whose link this message carries, so revoking the invite can cancel a message that has not gone out. */
    inviteId: uuid("invite_id").references(() => invite.id, { onDelete: "restrict" }),
  },
  (table) => [
    check("email_outbox_link_only_while_pending", sql`${table.link} IS NULL OR ${table.status} = 'pending'`),
    check("email_outbox_attempts_not_negative", sql`${table.attempts} >= 0`),
    index("email_outbox_due_idx").on(table.status, table.nextAttemptAt),
    index("email_outbox_invite_idx").on(table.inviteId),
  ],
);
