import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * "This was sent" keys, for things that must happen once: a target notice for a campaign and a month, an agency's share notice, the daily reminder to a
 * client, Fynix's daily summary. A key is a plain string made by the function that claims it (`target:month:<campaign>:<YYYY-MM>`, `waiting:<org>:<YYYY-MM-DD>`),
 * and a claim is an insert that does nothing when the key is already there. No runtime role touches the table: the SECURITY DEFINER functions of the
 * migration that follows it are the only way in.
 */
export const onceStamp = pgTable("once_stamp", {
  key: text("key").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
