import { sql } from "drizzle-orm";
import { check, foreignKey, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organisationKind } from "./enums";
import { member } from "./member";

/**
 * The Fynix name a client sees for an agency user ("Rahul, Fynix", spec section 4). One per agency member, unique across
 * all aliases (case-insensitively, so two people never share a face), and pinned to a member of an agency by the composite
 * key. The client never joins to this table: phase 2 copies the alias onto each row the client reads, so renaming an alias
 * later does not rewrite history. In phase 1C only Fynix reads it.
 */
export const agencyAlias = pgTable(
  "agency_alias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id").notNull(),
    memberOrgKind: organisationKind("member_org_kind").notNull().generatedAlwaysAs(sql`'agency'::organisation_kind`),
    alias: text("alias").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({ name: "agency_alias_member_fk", columns: [table.memberId, table.memberOrgKind], foreignColumns: [member.id, member.orgKind] }),
    uniqueIndex("agency_alias_member_unique").on(table.memberId),
    uniqueIndex("agency_alias_alias_unique").on(sql`lower(${table.alias})`),
    check("agency_alias_length", sql`char_length(btrim(${table.alias})) BETWEEN 2 AND 60 AND ${table.alias} = btrim(${table.alias})`),
  ],
);
