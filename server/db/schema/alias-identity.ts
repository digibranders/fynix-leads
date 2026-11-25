import { sql } from "drizzle-orm";
import { check, foreignKey, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organisationKind } from "./enums";
import { member } from "./member";
import { organisation } from "./organisation";

/**
 * Client alias identities for agency and coordinator members (spec v2 section 9.3, D31, D32).
 * Each agency person keeps several identities: display name, title, alias email, and the client it
 * belongs to. An alias email cannot be used until verified with a 6-digit code sent to that mailbox.
 */
export const aliasIdentity = pgTable(
  "alias_identity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicRef: text("public_ref").notNull(),
    memberId: uuid("member_id").notNull(),
    memberOrgKind: organisationKind("member_org_kind").notNull().generatedAlwaysAs(sql`'agency'::organisation_kind`),
    /**
     * The client the alias is for, picked from the clients of the campaigns the agency sees (phase 2). A trigger (migration 0064) checks that.
     * Migration 0078 filled it for every alias that could be matched by name; an alias left null must be edited to pick its client.
     */
    clientOrgId: uuid("client_org_id").references(() => organisation.id, { onDelete: "restrict" }),
    displayName: text("display_name").notNull(),
    jobTitle: text("job_title").notNull(),
    aliasEmail: text("alias_email").notNull(),
    verificationCodeHash: text("verification_code_hash"),
    verificationSentAt: timestamp("verification_sent_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("alias_identity_public_ref_unique").on(table.publicRef),
    foreignKey({
      name: "alias_identity_member_fk",
      columns: [table.memberId, table.memberOrgKind],
      foreignColumns: [member.id, member.orgKind],
    }),
    check("alias_identity_public_ref_format", sql`${table.publicRef} ~ '^ALI-[0-9A-HJKMNP-TV-Z]{4}$'`),
    check("alias_identity_status_check", sql`${table.status} IN ('active', 'archived')`),
    check("alias_identity_name_length", sql`char_length(btrim(${table.displayName})) BETWEEN 1 AND 100 AND ${table.displayName} = btrim(${table.displayName})`),
    check("alias_identity_title_length", sql`char_length(btrim(${table.jobTitle})) BETWEEN 1 AND 100 AND ${table.jobTitle} = btrim(${table.jobTitle})`),
    check("alias_identity_email_check", sql`${table.aliasEmail} = lower(btrim(${table.aliasEmail})) AND ${table.aliasEmail} ~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'`),
    // The name keeps its old "brand" wording: the domain code and the process that runs the previous release both look for it. A null client (an alias not yet matched) never collides.
    uniqueIndex("alias_identity_member_brand_email_unique").on(table.memberId, table.clientOrgId, table.aliasEmail),
  ],
);
