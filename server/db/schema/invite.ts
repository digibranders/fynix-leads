import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { memberRole, organisationKind } from "./enums";
import { organisation } from "./organisation";

/**
 * An invitation to join an organisation. The token itself is never stored: `token_hash` is its SHA-256 (base64url), so a
 * copy of this table cannot be used to redeem anything. Single use (`redeemed_at`), revocable (`revoked_at`), valid for
 * seven days (`expires_at`). The invite carries the name and, for an agency, the Fynix alias, so redeeming it needs only a
 * password and the acceptance of the terms.
 *
 * At most one live invite exists per address (`invite_one_live`), so issuing a new one has to revoke the old one in the
 * same transaction. Only `leads_auth` can see a row, and only the one whose hash the transaction names
 * (`app.invite_hash`, migration 0014).
 */
export const invite = pgTable(
  "invite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull(),
    orgKind: organisationKind("org_kind").notNull(),
    /** Lower case, like `user.email`. */
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: memberRole("role").notNull().default("member"),
    /** The alias the client sees for this person. Required for an agency invite, absent for a client invite. */
    alias: text("alias"),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({ name: "invite_org_fk", columns: [table.orgId, table.orgKind], foreignColumns: [organisation.id, organisation.kind] }),
    index("invite_org_idx").on(table.orgId),
    uniqueIndex("invite_one_live").on(table.email).where(sql`${table.redeemedAt} IS NULL AND ${table.revokedAt} IS NULL`),
    check("invite_email_lowercase", sql`${table.email} = lower(${table.email})`),
    check("invite_token_hash_format", sql`${table.tokenHash} ~ '^[A-Za-z0-9_-]{43}$'`),
    // There is one Fynix organisation and one Fynix admin in v1: nobody is invited into it.
    check("invite_not_fynix", sql`${table.orgKind} <> 'fynix'`),
    check("invite_alias_matches_kind", sql`(${table.orgKind} = 'agency' AND ${table.alias} IS NOT NULL) OR (${table.orgKind} <> 'agency' AND ${table.alias} IS NULL)`),
    check("invite_not_used_and_revoked", sql`NOT (${table.redeemedAt} IS NOT NULL AND ${table.revokedAt} IS NOT NULL)`),
  ],
);
