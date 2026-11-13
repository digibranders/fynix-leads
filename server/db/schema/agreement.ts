import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { campaign } from "./campaign";
import { agreementParty, agreementStatus } from "./enums";
import { member } from "./member";

/**
 * A virtual agreement (spec 7.2): what Fynix has agreed with the client, or with the supplier, for one campaign. Not a legal
 * document; it exists for trust and confidence. Each change is a new version that the other side accepts again.
 *
 * Like `terms_document`, a published version is never edited: Fynix holds UPDATE on `status` only, a new version supersedes
 * the current one in the same transaction (`one current version per campaign and party`), and a trigger refuses a
 * superseded version becoming current again (migration 0022). Versions count per campaign and party, from 1.
 *
 * No tenant role has a grant on this table until phase 1E, which decides who reads which agreement.
 */
export const agreement = pgTable(
  "agreement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "restrict" }),
    party: agreementParty("party").notNull(),
    version: integer("version").notNull(),
    monthlyTarget: integer("monthly_target").notNull(),
    totalTarget: integer("total_target").notNull(),
    /** How long after a meeting the client may dispute it. */
    disputeWindowHours: integer("dispute_window_hours").notNull().default(48),
    /** The no-show and cancellation rules, in words. */
    rules: text("rules").notNull().default(""),
    notes: text("notes").notNull().default(""),
    status: agreementStatus("status").notNull().default("current"),
    /** The Fynix admin who published this version. */
    createdBy: uuid("created_by")
      .notNull()
      .references(() => member.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("agreement_campaign_party_version_unique").on(table.campaignId, table.party, table.version),
    uniqueIndex("agreement_one_current").on(table.campaignId, table.party).where(sql`${table.status} = 'current'`),
    index("agreement_campaign_idx").on(table.campaignId),
    check("agreement_version_positive", sql`${table.version} >= 1`),
    check("agreement_targets_not_negative", sql`${table.monthlyTarget} >= 0 AND ${table.totalTarget} >= 0`),
    check("agreement_dispute_window_range", sql`${table.disputeWindowHours} BETWEEN 1 AND 720`),
  ],
);

/**
 * One row per user per version they accepted: when, and from which network address. Never changed or removed (Fynix holds
 * SELECT and INSERT only). In phase 1D a Fynix admin records an acceptance on behalf of the signer; phase 1E adds the tenant side.
 */
export const agreementAcceptance = pgTable(
  "agreement_acceptance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agreementId: uuid("agreement_id")
      .notNull()
      .references(() => agreement.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    networkAddress: text("network_address").notNull(),
  },
  (table) => [unique("agreement_acceptance_agreement_user_unique").on(table.agreementId, table.userId), index("agreement_acceptance_user_idx").on(table.userId)],
);
