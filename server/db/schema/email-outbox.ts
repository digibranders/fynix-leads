import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { emailTemplate, outboxStatus } from "./enums";

/**
 * Messages waiting to be sent. Phase 1B only writes it (the development transport, server/auth/mail.ts) so the
 * password reset flow has somewhere to put its link; nothing reads it but a developer. Phase 1C adds the Brevo transport,
 * the attempts and provider columns, and the purge of link emails.
 */
export const emailOutbox = pgTable("email_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipient: text("recipient").notNull(),
  template: emailTemplate("template").notNull(),
  subject: text("subject").notNull(),
  /** Plain text. In development this holds the reset link, which is the point. */
  body: text("body").notNull(),
  status: outboxStatus("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
