import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { organisationKind } from "./enums";
import { organisation } from "./organisation";

/**
 * The people Fynix talks to at a client: as many as it takes, each with a name and, if known, an email, a phone number and a job title.
 * They are contacts, not logins: nobody is invited by adding one. Only Fynix reads and writes them (migration 0082). A contact that is
 * taken off is hidden with `removed_at`, never deleted, so a later campaign that names it as its primary contact keeps its link.
 * `client_org_kind` is pinned to `client` by a check and a composite foreign key, so a contact cannot hang off an agency.
 */
export const clientContact = pgTable(
  "client_contact",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientOrgId: uuid("client_org_id").notNull(),
    clientOrgKind: organisationKind("client_org_kind").notNull().default("client"),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    jobTitle: text("job_title"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({ name: "client_contact_org_fk", columns: [table.clientOrgId, table.clientOrgKind], foreignColumns: [organisation.id, organisation.kind] }),
    index("client_contact_client_idx").on(table.clientOrgId),
    // The target of `campaign`'s composite foreign key, which keeps a campaign's primary contact inside the campaign's own client.
    unique("client_contact_id_client_unique").on(table.id, table.clientOrgId),
    check("client_contact_is_client", sql`${table.clientOrgKind} = 'client'`),
    check("client_contact_name_length", sql`char_length(btrim(${table.name})) BETWEEN 1 AND 120`),
    check("client_contact_email_length", sql`${table.email} IS NULL OR char_length(${table.email}) BETWEEN 3 AND 254`),
    check("client_contact_phone_length", sql`${table.phone} IS NULL OR char_length(${table.phone}) BETWEEN 3 AND 40`),
    check("client_contact_job_title_length", sql`${table.jobTitle} IS NULL OR char_length(btrim(${table.jobTitle})) BETWEEN 1 AND 120`),
  ],
);
