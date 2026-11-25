import { and, desc, eq, gte, lte, ne, or } from "drizzle-orm";
import type { LeadStage } from "@/lib/leads/stage";
import { agencyLeadColumns, agencyMeetingColumns, clientLeadColumns, clientMeetingColumns } from "@/server/db/columns";
import type { Database } from "@/server/db/pool";
import { campaign, lead, meeting, organisation } from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import { generateAgencyLeadsCsv, generateClientLeadsCsv, generateFynixLeadsCsv, generateMeetingsCsv, type MeetingExportRow } from "@/server/domain/exports";
import type { FynixActor } from "@/server/domain/fynix-write";
import { campaignClientName } from "@/server/db/client-name";

/**
 * CSV exports of leads and meetings for each portal. What a file holds is what the same viewer's screens read: a client's file comes through the client's
 * column list and policies (no source organisation, no alias, never a draft), the coordinator's and an agency's through the agency role (no client person; the
 * coordinator also gets its partner agencies' leads, an agency only its own), Fynix's through the Fynix role. Cells that start with = + - or @ are written as
 * text by `toCsv`. A draft is left out of every file unless the filter asks for the draft stage.
 */
export interface ExportFilter {
  readonly campaignId?: string;
  /** Only leads sent by this coordinator or agency. Read by Fynix exports only: a tenant role cannot read `lead.source_org_id` of every lead. */
  readonly sourceOrgId?: string;
  readonly stage?: LeadStage;
  /** Leads and meetings from this moment on (submitted for a lead, scheduled start for a meeting). */
  readonly from?: Date;
  readonly to?: Date;
}

/** A tenant actor has an `orgKind`; the Fynix actor is a bare user, and the database passed with it is the Fynix one. */
export type ExportActor = TenantActor | FynixActor;
const isTenant = (actor: ExportActor): actor is TenantActor => "orgKind" in actor;

function leadConditions(filter: ExportFilter) {
  return [
    filter.stage === undefined ? ne(lead.stage, "draft") : eq(lead.stage, filter.stage),
    ...(filter.campaignId === undefined ? [] : [eq(lead.campaignId, filter.campaignId)]),
    ...(filter.from === undefined ? [] : [gte(lead.submittedAt, filter.from)]),
    ...(filter.to === undefined ? [] : [lte(lead.submittedAt, filter.to)]),
  ];
}

function meetingConditions(filter: ExportFilter) {
  return [
    ...(filter.campaignId === undefined ? [] : [eq(meeting.campaignId, filter.campaignId)]),
    ...(filter.from === undefined ? [] : [gte(meeting.scheduledStartTime, filter.from)]),
    ...(filter.to === undefined ? [] : [lte(meeting.scheduledStartTime, filter.to)]),
  ];
}

export async function exportLeadsCsv(db: Database, actor: ExportActor, filter: ExportFilter = {}): Promise<string> {
  if (!isTenant(actor)) {
    const rows = await db
      .select({
        publicRef: lead.publicRef,
        campaignName: campaign.name,
        clientName: campaignClientName(campaign.id),
        prospectName: lead.prospectName,
        prospectTitle: lead.prospectTitle,
        prospectCompany: lead.prospectCompany,
        prospectDomain: lead.prospectDomain,
        prospectEmail: lead.prospectEmail,
        prospectPhone: lead.prospectPhone,
        stage: lead.stage,
        overShare: lead.overShare,
        duplicateOverride: lead.duplicateOverride,
        scheduledMeetingTime: lead.scheduledMeetingTime,
        submittedAt: lead.submittedAt,
      })
      .from(lead)
      .innerJoin(campaign, eq(campaign.id, lead.campaignId))
      .where(and(...leadConditions(filter), ...(filter.sourceOrgId === undefined ? [] : [eq(lead.sourceOrgId, filter.sourceOrgId)])))
      .orderBy(desc(lead.submittedAt));
    return generateFynixLeadsCsv(rows);
  }
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    if (actor.orgKind === "client") {
      const rows = await tx
        .select(clientLeadColumns)
        .from(lead)
        .innerJoin(campaign, eq(campaign.id, lead.campaignId))
        .where(and(eq(campaign.clientOrgId, actor.orgId), ...leadConditions(filter)))
        .orderBy(desc(lead.submittedAt));
      return generateClientLeadsCsv(rows);
    }
    const rows = await tx
      .select(agencyLeadColumns)
      .from(lead)
      .where(and(...leadConditions(filter)))
      .orderBy(desc(lead.submittedAt));
    return generateAgencyLeadsCsv(rows);
  });
}

export async function exportMeetingsCsv(db: Database, actor: ExportActor, filter: ExportFilter = {}): Promise<string> {
  const prospect = { prospectName: lead.prospectName, prospectCompany: lead.prospectCompany, leadRef: lead.publicRef, campaignName: campaign.name };
  if (!isTenant(actor)) {
    const rows = await db
      .select({ ...agencyMeetingColumns, ...prospect, clientName: organisation.name })
      .from(meeting)
      .innerJoin(lead, eq(lead.id, meeting.leadId))
      .innerJoin(campaign, eq(campaign.id, meeting.campaignId))
      .innerJoin(organisation, eq(organisation.id, campaign.clientOrgId))
      .where(and(...meetingConditions(filter), ...(filter.sourceOrgId === undefined ? [] : [eq(lead.sourceOrgId, filter.sourceOrgId)])))
      .orderBy(desc(meeting.scheduledStartTime));
    return generateMeetingsCsv(rows satisfies MeetingExportRow[], { withClient: true });
  }
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    if (actor.orgKind === "client") {
      const rows = await tx
        .select({ ...clientMeetingColumns, ...prospect })
        .from(meeting)
        .innerJoin(lead, eq(lead.id, meeting.leadId))
        .innerJoin(campaign, eq(campaign.id, meeting.campaignId))
        .where(and(eq(campaign.clientOrgId, actor.orgId), ...meetingConditions(filter)))
        .orderBy(desc(meeting.scheduledStartTime));
      return generateMeetingsCsv(rows);
    }
    // The meeting policy lets a partner agency read every meeting of a campaign it has a share in, so the agency's file names its own leads and the coordinator's campaigns.
    const rows = await tx
      .select({ ...agencyMeetingColumns, ...prospect, clientName: campaignClientName(campaign.id) })
      .from(meeting)
      .innerJoin(lead, eq(lead.id, meeting.leadId))
      .innerJoin(campaign, eq(campaign.id, meeting.campaignId))
      .where(and(or(eq(lead.sourceOrgId, actor.orgId), eq(campaign.agencyOrgId, actor.orgId)), ...meetingConditions(filter)))
      .orderBy(desc(meeting.scheduledStartTime));
    return generateMeetingsCsv(rows, { withClient: true });
  });
}
