import { sql } from "drizzle-orm";
import { check, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Fixed-window counters for the rate limits (server/auth/rate-limit.ts). One row per key per window. `key_hash` is the
 * SHA-256 of the key, so no email address and no network address is ever stored. Only `leads_public` reads or writes it.
 */
export const rateLimit = pgTable(
  "rate_limit",
  {
    keyHash: text("key_hash").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.keyHash, table.windowStart] }), check("rate_limit_count_positive", sql`${table.count} >= 1`)],
);
