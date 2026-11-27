import type { PgColumn } from "drizzle-orm/pg-core";
import {
  campaign,
  conversation,
  conversationMessage,
  lead,
  meeting,
  meetingJoin,
  meetingReschedule,
  notification,
  organisation,
  rejectionReview,
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
} as const;

const tenantCampaignColumns = {
  id: campaign.id,
  publicRef: campaign.publicRef,
  name: campaign.name,
  status: campaign.status,
  startDate: campaign.startDate,
  endDate: campaign.endDate,
  monthlyTarget: campaign.monthlyTarget,
  totalTarget: campaign.totalTarget,
} as const;

/** Separate constants per role, so a later phase can give the roles different columns without touching the other. */
/** A client also reads its own time zone (migration 0059); an agency does not read a client's. */
export const clientOrganisationColumns = { ...tenantOrganisationColumns, timeZone: organisation.timeZone } as const;
export const agencyOrganisationColumns = { ...tenantOrganisationColumns, parentOrgId: organisation.parentOrgId } as const;
/**
 * A client also reads the privacy link of its campaigns and whether prospect email is on for them (migration 0075): it is named in the prospect letter as the
 * holder of the prospect's details. An agency reads neither; the letter takes the link from the database when it is queued.
 */
export const clientCampaignColumns = { ...tenantCampaignColumns, clientPrivacyUrl: campaign.clientPrivacyUrl, prospectEmailEnabled: campaign.prospectEmailEnabled } as const;
export const agencyCampaignColumns = { ...tenantCampaignColumns } as const;

/**
 * The brief of a campaign: who to reach, how a lead is qualified and the instructions. Migration 0054 granted it to the agency role (coordinators and
 * partner agencies), who need it to find and qualify prospects. A client wrote it with Fynix and has had the same grant since migration 0064. It is apart from
 * `agencyCampaignColumns` because only the campaign screens select it; the structure test adds it for the agency role when it compares the grants.
 */
export const agencyCampaignBriefColumns = {
  geography: campaign.geography,
  industries: campaign.industries,
  companySize: campaign.companySize,
  icp: campaign.icp,
  jobTitles: campaign.jobTitles,
  seniority: campaign.seniority,
  technologies: campaign.technologies,
  bantBudget: campaign.bantBudget,
  bantAuthority: campaign.bantAuthority,
  bantNeed: campaign.bantNeed,
  bantTimeline: campaign.bantTimeline,
  instructions: campaign.instructions,
  pitchIntroduction: campaign.pitchIntroduction,
  pitchServices: campaign.pitchServices,
  pitchDifferentiator: campaign.pitchDifferentiator,
  pitchCollaterals: campaign.pitchCollaterals,
  pitchCaseStudies: campaign.pitchCaseStudies,
  qualifyingQuestions: campaign.qualifyingQuestions,
  qualifyingItems: campaign.qualifyingItems,
  firstEmail: campaign.firstEmail,
  secondEmail: campaign.secondEmail,
} as const;

/** Since migration 0064 a client reads the brief of its own campaigns too: it wrote it with Fynix. Same columns as the agency's. */
export const clientCampaignBriefColumns = agencyCampaignBriefColumns;

const sharedLeadColumns = {
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
  qualificationChecks: lead.qualificationChecks,
  qualificationNotes: lead.qualificationNotes,
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
  // The client's answer after the meeting (migration 0066). `decisionBy` is a person, so only the client reads it.
  outcomeRecordedAt: lead.outcomeRecordedAt,
  decisionNote: lead.decisionNote,
  decisionAt: lead.decisionAt,
  decisionSource: lead.decisionSource,
  // False for a draft and a discarded draft (migration 0069); the policies already hide those rows from anyone but the source organisation.
  released: lead.released,
} as const;

export const clientLeadColumns = { ...sharedLeadColumns, decisionByUserId: lead.decisionByUserId } as const;

export const agencyLeadColumns = {
  ...sharedLeadColumns,
  sourceOrgId: lead.sourceOrgId,
  aliasIdentityId: lead.aliasIdentityId,
  overShare: lead.overShare,
  duplicateOverride: lead.duplicateOverride,
  rejectionReviewedAt: lead.rejectionReviewedAt,
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
  recordedAt: meeting.recordedAt,
  recordedByRole: meeting.recordedByRole,
  // A contest of the recorded outcome (migration 0069): who contested is a side, never a person.
  contestedAt: meeting.contestedAt,
  contestNote: meeting.contestNote,
  contestedByRole: meeting.contestedByRole,
  createdAt: meeting.createdAt,
  updatedAt: meeting.updatedAt,
} as const;

export const agencyMeetingColumns = { ...clientMeetingColumns } as const;

/**
 * Who joined a meeting's room (migration 0075): the name as it appeared there, when they joined and left and for how long. No id, no email, no account: the
 * importer never stores one. The client, the agencies and Fynix read the rows of the meetings they can read.
 */
export const meetingJoinColumns = {
  meetingId: meetingJoin.meetingId,
  displayName: meetingJoin.displayName,
  joinedAt: meetingJoin.joinedAt,
  leftAt: meetingJoin.leftAt,
  durationSeconds: meetingJoin.durationSeconds,
} as const;

/** A proposal to move a meeting. `proposed_by_user_id` is never granted: the other side must not learn which person asked. */
export const rescheduleColumns = {
  id: meetingReschedule.id,
  meetingId: meetingReschedule.meetingId,
  proposedBySide: meetingReschedule.proposedBySide,
  proposedTimes: meetingReschedule.proposedTimes,
  status: meetingReschedule.status,
  pickedTime: meetingReschedule.pickedTime,
  createdAt: meetingReschedule.createdAt,
  resolvedAt: meetingReschedule.resolvedAt,
} as const;
export const clientRescheduleColumns = { ...rescheduleColumns } as const;
export const agencyRescheduleColumns = { ...rescheduleColumns } as const;

/** The coordinator's request for a review of a rejection. No client role reads it. */
export const agencyRejectionReviewColumns = {
  id: rejectionReview.id,
  leadId: rejectionReview.leadId,
  note: rejectionReview.note,
  requestedAt: rejectionReview.requestedAt,
  status: rejectionReview.status,
  resolvedAt: rejectionReview.resolvedAt,
} as const;

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
  coordinatorOrgId: conversation.coordinatorOrgId,
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
  // What the notice is about (migration 0070). The person already reads the lead, meeting or campaign it names.
  leadId: notification.leadId,
  meetingId: notification.meetingId,
  campaignId: notification.campaignId,
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
