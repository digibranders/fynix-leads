import type { PgColumn } from "drizzle-orm/pg-core";
import {
  campaign,
  conversation,
  conversationMessage,
  lead,
  meeting,
  notification,
  organisation,
} from "@/server/db/schema";
import type { TenantRoleName } from "@/server/db/roles";

/**
 * The columns each tenant role may read, one typed list per role and table. A tenant role has no table-level SELECT,
 * so a Drizzle select with no column list fails for it by design; every tenant read passes one of these lists instead.
 *
 * The lists mirror the GRANT statements in the hand-written migrations. Two tests keep them honest:
 * columns.test.ts proves a list never contains a forbidden column, and rls.integration.test.ts proves each list is
 * exactly what the database granted. Changing a grant means changing the list in the same commit.
 */
const tenantOrganisationColumns = {
  publicRef: organisation.publicRef,
  kind: organisation.kind,
  name: organisation.name,
  brandName: organisation.brandName,
} as const;

const tenantCampaignColumns = {
  id: campaign.id,
  publicRef: campaign.publicRef,
  name: campaign.name,
  clientBrandName: campaign.clientBrandName,
  status: campaign.status,
  startDate: campaign.startDate,
  endDate: campaign.endDate,
  monthlyTarget: campaign.monthlyTarget,
  totalTarget: campaign.totalTarget,
} as const;

/** Separate constants per role, so a later phase can give the roles different columns without touching the other. */
export const clientOrganisationColumns = { ...tenantOrganisationColumns } as const;
export const agencyOrganisationColumns = { ...tenantOrganisationColumns, parentOrgId: organisation.parentOrgId } as const;
export const clientCampaignColumns = { ...tenantCampaignColumns } as const;
export const agencyCampaignColumns = { ...tenantCampaignColumns } as const;

export const clientLeadColumns = {
  id: lead.id,
  publicRef: lead.publicRef,
  campaignId: lead.campaignId,
  hostMemberId: lead.hostMemberId,
  prospectName: lead.prospectName,
  prospectTitle: lead.prospectTitle,
  prospectCompany: lead.prospectCompany,
  prospectDomain: lead.prospectDomain,
  prospectLinkedinUrl: lead.prospectLinkedinUrl,
  prospectEmail: lead.prospectEmail,
  prospectPhone: lead.prospectPhone,
  prospectNotes: lead.prospectNotes,
  bantBudget: lead.bantBudget,
  bantAuthority: lead.bantAuthority,
  bantNeed: lead.bantNeed,
  bantTimeline: lead.bantTimeline,
  stage: lead.stage,
  declineReason: lead.declineReason,
  disputeReason: lead.disputeReason,
  proposedTimes: lead.proposedTimes,
  scheduledMeetingTime: lead.scheduledMeetingTime,
  submittedAt: lead.submittedAt,
  scheduledAt: lead.scheduledAt,
  deliveredAt: lead.deliveredAt,
  disputedAt: lead.disputedAt,
  closedAt: lead.closedAt,
  createdAt: lead.createdAt,
  updatedAt: lead.updatedAt,
} as const;

export const agencyLeadColumns = {
  ...clientLeadColumns,
  sourceOrgId: lead.sourceOrgId,
  aliasIdentityId: lead.aliasIdentityId,
  overShare: lead.overShare,
  duplicateOverride: lead.duplicateOverride,
} as const;

export const clientMeetingColumns = {
  id: meeting.id,
  publicRef: meeting.publicRef,
  leadId: meeting.leadId,
  campaignId: meeting.campaignId,
  hostMemberId: meeting.hostMemberId,
  scheduledStartTime: meeting.scheduledStartTime,
  durationMinutes: meeting.durationMinutes,
  googleMeetUrl: meeting.googleMeetUrl,
  outcome: meeting.outcome,
  notes: meeting.notes,
  heldAt: meeting.heldAt,
  createdAt: meeting.createdAt,
  updatedAt: meeting.updatedAt,
} as const;

export const agencyMeetingColumns = { ...clientMeetingColumns } as const;

export const clientConversationColumns = {
  id: conversation.id,
  publicRef: conversation.publicRef,
  campaignId: conversation.campaignId,
  leadId: conversation.leadId,
  side: conversation.side,
  clientOrgId: conversation.clientOrgId,
  subject: conversation.subject,
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt,
} as const;

export const agencyConversationColumns = {
  id: conversation.id,
  publicRef: conversation.publicRef,
  campaignId: conversation.campaignId,
  leadId: conversation.leadId,
  side: conversation.side,
  supplierOrgId: conversation.supplierOrgId,
  agencyOrgId: conversation.agencyOrgId,
  subject: conversation.subject,
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt,
} as const;

export const tenantConversationMessageColumns = {
  id: conversationMessage.id,
  conversationId: conversationMessage.conversationId,
  senderUserId: conversationMessage.senderUserId,
  senderRole: conversationMessage.senderRole,
  senderName: conversationMessage.senderName,
  body: conversationMessage.body,
  forwardOfMessageId: conversationMessage.forwardOfMessageId,
  scrubbedCount: conversationMessage.scrubbedCount,
  createdAt: conversationMessage.createdAt,
} as const;

export const clientConversationMessageColumns = { ...tenantConversationMessageColumns } as const;
export const agencyConversationMessageColumns = { ...tenantConversationMessageColumns } as const;

export const tenantNotificationColumns = {
  id: notification.id,
  userId: notification.userId,
  orgId: notification.orgId,
  kind: notification.kind,
  title: notification.title,
  body: notification.body,
  link: notification.link,
  readAt: notification.readAt,
  createdAt: notification.createdAt,
} as const;

export const clientNotificationColumns = { ...tenantNotificationColumns } as const;
export const agencyNotificationColumns = { ...tenantNotificationColumns } as const;

export const TENANT_COLUMNS = {
  leads_client: {
    organisation: clientOrganisationColumns,
    campaign: clientCampaignColumns,
    lead: clientLeadColumns,
    meeting: clientMeetingColumns,
    conversation: clientConversationColumns,
    conversationMessage: clientConversationMessageColumns,
    notification: clientNotificationColumns,
  },
  leads_agency: {
    organisation: agencyOrganisationColumns,
    campaign: agencyCampaignColumns,
    lead: agencyLeadColumns,
    meeting: agencyMeetingColumns,
    conversation: agencyConversationColumns,
    conversationMessage: agencyConversationMessageColumns,
    notification: agencyNotificationColumns,
  },
} as const satisfies Record<
  TenantRoleName,
  {
    organisation: Record<string, PgColumn>;
    campaign: Record<string, PgColumn>;
    lead: Record<string, PgColumn>;
    meeting: Record<string, PgColumn>;
    conversation: Record<string, PgColumn>;
    conversationMessage: Record<string, PgColumn>;
    notification: Record<string, PgColumn>;
  }
>;

/** The database column names in a list, for comparing with the catalog. */
export function columnNames(columns: Readonly<Record<string, PgColumn>>): string[] {
  return Object.values(columns).map((column) => column.name);
}
