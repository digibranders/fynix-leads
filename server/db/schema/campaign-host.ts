import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { campaign } from "./campaign";
import { member } from "./member";

/**
 * The people of the client who take meetings for a campaign (spec 7.3). Both composite foreign keys use `client_org_id`, a
 * copy of the campaign's client that the service fills in: one key proves the campaign belongs to that client, the other that
 * the member belongs to it, so the database refuses a host from any other organisation without a trigger and without a race.
 *
 * A host is never removed: `active` is switched off, which keeps the meetings they took (phase 3). No tenant role has a grant
 * until phase 1E.
 */
export const campaignHost = pgTable(
  "campaign_host",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id").notNull(),
    clientOrgId: uuid("client_org_id").notNull(),
    memberId: uuid("member_id").notNull(),
    /** What the coordinator and its agencies are told the host does, next to the name and the company. */
    jobTitle: text("job_title").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({ name: "campaign_host_campaign_fk", columns: [table.campaignId, table.clientOrgId], foreignColumns: [campaign.id, campaign.clientOrgId] }),
    foreignKey({ name: "campaign_host_member_fk", columns: [table.memberId, table.clientOrgId], foreignColumns: [member.id, member.orgId] }),
    unique("campaign_host_campaign_member_unique").on(table.campaignId, table.memberId),
    index("campaign_host_member_idx").on(table.memberId),
    check("campaign_host_job_title_length", sql`char_length(btrim(${table.jobTitle})) BETWEEN 1 AND 120`),
  ],
);
