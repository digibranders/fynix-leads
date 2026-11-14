import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { campaign } from "./campaign";
import { lead } from "./lead";
import { organisation } from "./organisation";

export const CONVERSATION_SIDES = [
  "client_fynix",
  "supplier_fynix",
  "supplier_agency",
] as const;

export type ConversationSide = (typeof CONVERSATION_SIDES)[number];

export const SENDER_ROLES = [
  "client",
  "supplier",
  "agency",
  "fynix",
] as const;

export type SenderRole = (typeof SENDER_ROLES)[number];

export const NOTIFICATION_KINDS = [
  "lead_submitted",
  "lead_reviewed",
  "meeting_scheduled",
  "outcome_recorded",
  "dispute_raised",
  "message_received",
  "general",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * Conversations representing threads across tenant and platform boundaries.
 * Enforces side restrictions: client_fynix, supplier_fynix, or supplier_agency.
 */
export const conversation = pgTable(
  "conversation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicRef: text("public_ref").notNull(),
    campaignId: uuid("campaign_id").notNull(),
    leadId: uuid("lead_id"),
    side: text("side").notNull(),
    clientOrgId: uuid("client_org_id"),
    supplierOrgId: uuid("supplier_org_id"),
    agencyOrgId: uuid("agency_org_id"),
    subject: text("subject"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("conversation_public_ref_unique").on(table.publicRef),
    foreignKey({
      name: "conversation_campaign_fk",
      columns: [table.campaignId],
      foreignColumns: [campaign.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "conversation_lead_fk",
      columns: [table.leadId],
      foreignColumns: [lead.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "conversation_client_org_fk",
      columns: [table.clientOrgId],
      foreignColumns: [organisation.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "conversation_supplier_org_fk",
      columns: [table.supplierOrgId],
      foreignColumns: [organisation.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "conversation_agency_org_fk",
      columns: [table.agencyOrgId],
      foreignColumns: [organisation.id],
    }).onDelete("cascade"),
    check("conversation_public_ref_format", sql`${table.publicRef} ~ '^MSG-[0-9A-HJKMNP-TV-Z]{4}$'`),
    check(
      "conversation_side_check",
      sql`${table.side} IN ('client_fynix', 'supplier_fynix', 'supplier_agency')`,
    ),
    index("conversation_campaign_idx").on(table.campaignId),
    index("conversation_lead_idx").on(table.leadId),
    index("conversation_client_org_idx").on(table.clientOrgId),
    index("conversation_supplier_org_idx").on(table.supplierOrgId),
    index("conversation_agency_org_idx").on(table.agencyOrgId),
  ],
);

/**
 * Individual messages within a conversation thread.
 * Supports forwarding of messages across hops with contact scrubbing.
 */
export const conversationMessage = pgTable(
  "conversation_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull(),
    senderUserId: text("sender_user_id").notNull(),
    senderOrgId: uuid("sender_org_id"),
    senderRole: text("sender_role").notNull(),
    senderName: text("sender_name").notNull(),
    body: text("body").notNull(),
    forwardOfMessageId: uuid("forward_of_message_id"),
    scrubbedCount: integer("scrubbed_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "conversation_message_conversation_fk",
      columns: [table.conversationId],
      foreignColumns: [conversation.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "conversation_message_sender_user_fk",
      columns: [table.senderUserId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "conversation_message_sender_org_fk",
      columns: [table.senderOrgId],
      foreignColumns: [organisation.id],
    }).onDelete("set null"),
    foreignKey({
      name: "conversation_message_forward_of_fk",
      columns: [table.forwardOfMessageId],
      foreignColumns: [table.id],
    }).onDelete("set null"),
    check(
      "conversation_message_role_check",
      sql`${table.senderRole} IN ('client', 'supplier', 'agency', 'fynix')`,
    ),
    index("conversation_message_conv_created_idx").on(table.conversationId, table.createdAt),
    index("conversation_message_sender_user_idx").on(table.senderUserId),
  ],
);

/**
 * In-app notifications for users across lead submissions, reviews, meetings, and messages.
 */
export const notification = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    orgId: uuid("org_id"),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "notification_user_fk",
      columns: [table.userId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "notification_org_fk",
      columns: [table.orgId],
      foreignColumns: [organisation.id],
    }).onDelete("set null"),
    check(
      "notification_kind_check",
      sql`${table.kind} IN ('lead_submitted', 'lead_reviewed', 'meeting_scheduled', 'outcome_recorded', 'dispute_raised', 'message_received', 'general')`,
    ),
    index("notification_user_read_idx").on(table.userId, table.readAt),
    index("notification_user_created_idx").on(table.userId, table.createdAt),
  ],
);
