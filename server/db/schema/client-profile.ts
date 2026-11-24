import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { organisationKind } from "./enums";
import { organisation } from "./organisation";

/**
 * How a client is presented to the coordinator and the agencies that work for it (roadmap phase 1). One row per client. Only Fynix
 * writes it; the client reads its own row, and a coordinator or agency reads the rows of the clients of the campaigns it sees (migration 0060).
 * `client_org_kind` is pinned to `client` by a check and a composite foreign key, so a profile cannot hang off an agency.
 */
export const clientProfile = pgTable(
  "client_profile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientOrgId: uuid("client_org_id").notNull(),
    clientOrgKind: organisationKind("client_org_kind").notNull().default("client"),
    /** How the client is introduced to a prospect. */
    introduction: text("introduction").notNull().default(""),
    /** The services the client offers. */
    services: text("services").notNull().default(""),
    /** The one key differentiating factor. */
    differentiator: text("differentiator").notNull().default(""),
    caseStudies: text("case_studies"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("client_profile_client_unique").on(table.clientOrgId),
    foreignKey({ name: "client_profile_org_fk", columns: [table.clientOrgId, table.clientOrgKind], foreignColumns: [organisation.id, organisation.kind] }),
    check("client_profile_is_client", sql`${table.clientOrgKind} = 'client'`),
  ],
);

/**
 * Marketing material for a client: a link now, an uploaded file when the upload pipeline (virus scan, storage key) is wired to this screen.
 * `file_ref` is the storage key of an upload and is null for a link. A row is never deleted: `removed_at` hides it from the client and the
 * agencies, and Fynix still sees it.
 */
export const clientCollateral = pgTable(
  "client_collateral",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientOrgId: uuid("client_org_id").notNull(),
    clientOrgKind: organisationKind("client_org_kind").notNull().default("client"),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    fileRef: text("file_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({ name: "client_collateral_org_fk", columns: [table.clientOrgId, table.clientOrgKind], foreignColumns: [organisation.id, organisation.kind] }),
    index("client_collateral_client_idx").on(table.clientOrgId),
    check("client_collateral_is_client", sql`${table.clientOrgKind} = 'client'`),
    check("client_collateral_kind", sql`${table.kind} IN ('file', 'link')`),
    check("client_collateral_target", sql`(${table.kind} = 'link' AND ${table.url} IS NOT NULL AND ${table.fileRef} IS NULL) OR (${table.kind} = 'file' AND ${table.fileRef} IS NOT NULL AND ${table.url} IS NULL)`),
    check("client_collateral_title_length", sql`char_length(btrim(${table.title})) BETWEEN 1 AND 160`),
  ],
);
