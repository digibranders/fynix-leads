import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { member } from "./member";

export const CALENDAR_PROVIDER_VALUES = ["google", "microsoft"] as const;
export const CALENDAR_CONNECTION_STATUSES = ["connected", "broken"] as const;

/**
 * A person's connected Google or Microsoft calendar (a person of a client, an agency or Fynix; only a client person's busy time is synced, the others are read live for their own screen) (calendar spec of 2026-11-26, section 8). One per provider per person. It holds the refresh token,
 * encrypted with AES-256-GCM (`CALENDAR_TOKEN_KEY` lives in the environment), and the state of the sync. Access tokens are never stored. Only `leads_auth` touches the
 * table; the person's own connections and Fynix's warnings are read through database functions that return no token. Removing a connection is a setting, like
 * `host_hours`: the row and its busy times go.
 */
export const calendarConnection = pgTable(
  "calendar_connection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id").notNull(),
    provider: text("provider").notNull(),
    refreshTokenEnc: text("refresh_token_enc").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    status: text("status").notNull().default("connected"),
    failedSyncs: integer("failed_syncs").notNull().default(0),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({ name: "calendar_connection_member_fk", columns: [table.memberId], foreignColumns: [member.id] }),
    unique("calendar_connection_member_provider_unique").on(table.memberId, table.provider),
    check("calendar_connection_provider_check", sql`${table.provider} IN ('google', 'microsoft')`),
    check("calendar_connection_status_check", sql`${table.status} IN ('connected', 'broken')`),
    check("calendar_connection_failed_syncs_check", sql`${table.failedSyncs} >= 0`),
  ],
);

/**
 * When a connected person is busy, as bare start and end times and nothing else: no title, no place, no attendee. The sync replaces a connection's rows as a whole.
 * Read only through the busy-time functions, so the person's colleagues, the agencies and Fynix see Busy and no reason.
 */
export const memberBusy = pgTable(
  "member_busy",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id").notNull(),
    memberId: uuid("member_id").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({ name: "member_busy_connection_fk", columns: [table.connectionId], foreignColumns: [calendarConnection.id] }).onDelete("cascade"),
    index("member_busy_member_idx").on(table.memberId, table.startsAt),
    check("member_busy_order_check", sql`${table.startsAt} < ${table.endsAt}`),
  ],
);
