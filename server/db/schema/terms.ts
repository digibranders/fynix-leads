import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { organisationKind, termsStatus } from "./enums";

/**
 * A published version of the terms for one party (`client`, `agency` or `fynix`). A published document is never edited:
 * what a person accepted must stay exactly as they read it, so Fynix has UPDATE on `status` only. Publishing a new
 * version marks the old one `superseded` and the users of that party must accept the new one.
 *
 * `placeholder` marks text that is not yet lawyer-approved (gate G2); see lib/terms/placeholder.ts.
 */
export const termsDocument = pgTable(
  "terms_document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    party: organisationKind("party").notNull(),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: termsStatus("status").notNull().default("current"),
    placeholder: boolean("placeholder").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("terms_document_party_version_unique").on(table.party, table.version),
    // The target of the composite foreign key from `terms_acceptance`, which keeps an acceptance's party equal to its document's.
    unique("terms_document_id_party_unique").on(table.id, table.party),
    // One current version per party.
    uniqueIndex("terms_document_one_current").on(table.party).where(sql`${table.status} = 'current'`),
    check("terms_document_version_positive", sql`${table.version} >= 1`),
  ],
);

/**
 * One row per user per version they accepted: when, and from which network address (the address the rate limits use,
 * `unknown` when no proxy header was present). `party` is a copy of the document's, pinned by the composite key.
 */
export const termsAcceptance = pgTable(
  "terms_acceptance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    documentId: uuid("document_id").notNull(),
    party: organisationKind("party").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    networkAddress: text("network_address").notNull(),
  },
  (table) => [
    unique("terms_acceptance_user_document_unique").on(table.userId, table.documentId),
    foreignKey({ name: "terms_acceptance_document_fk", columns: [table.documentId, table.party], foreignColumns: [termsDocument.id, termsDocument.party] }),
    index("terms_acceptance_user_idx").on(table.userId),
  ],
);
