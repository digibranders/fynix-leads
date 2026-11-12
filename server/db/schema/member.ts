import { foreignKey, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { memberRole, memberStatus, organisationKind } from "./enums";
import { organisation } from "./organisation";

/**
 * Which organisation a user belongs to, and so which kind of user they are. Session resolution reads this one table
 * (as `leads_auth`) to learn the organisation id and kind and so pick the role pool.
 *
 * - One row per user (`member_user_unique`): a person belongs to exactly one organisation, so a session resolves to
 *   exactly one role. Someone who works for a client and an agency uses two email addresses.
 * - `org_kind` is a copy of the organisation's kind, pinned by the composite foreign key, so session resolution
 *   needs no grant on `organisation`.
 * - A suspended member keeps their rows but cannot sign in and their sessions stop resolving.
 * Phase 1C adds the admin features (invite, suspend, alias).
 */
export const member = pgTable(
  "member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    orgId: uuid("org_id").notNull(),
    orgKind: organisationKind("org_kind").notNull(),
    role: memberRole("role").notNull().default("member"),
    displayName: text("display_name").notNull(),
    status: memberStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("member_user_unique").on(table.userId),
    foreignKey({ name: "member_org_fk", columns: [table.orgId, table.orgKind], foreignColumns: [organisation.id, organisation.kind] }),
    index("member_org_idx").on(table.orgId),
  ],
);
