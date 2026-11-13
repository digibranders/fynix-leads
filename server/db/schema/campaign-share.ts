import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { campaign } from "./campaign";
import { organisationKind } from "./enums";
import { organisation } from "./organisation";

/**
 * How much of the supplier's monthly target one agency carries (spec 7.2, "Shares"). The agency is the campaign's supplier
 * itself (a supplier who works alone) or one of its partner agencies: a trigger (migration 0024) refuses any other agency.
 * A sum of shares above the supplier's target is allowed; the service reports it as a flag the screen shows.
 *
 * `agency_org_kind` is a constant, so the composite foreign key makes the database refuse a client. No tenant role has a grant
 * until phase 1E (an agency will read its own share).
 */
export const campaignShare = pgTable(
  "campaign_share",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "restrict" }),
    agencyOrgId: uuid("agency_org_id").notNull(),
    agencyOrgKind: organisationKind("agency_org_kind").notNull().generatedAlwaysAs(sql`'agency'::organisation_kind`),
    monthlyShare: integer("monthly_share").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({ name: "campaign_share_agency_fk", columns: [table.agencyOrgId, table.agencyOrgKind], foreignColumns: [organisation.id, organisation.kind] }),
    unique("campaign_share_campaign_agency_unique").on(table.campaignId, table.agencyOrgId),
    index("campaign_share_agency_idx").on(table.agencyOrgId),
    check("campaign_share_not_negative", sql`${table.monthlyShare} >= 0`),
  ],
);
