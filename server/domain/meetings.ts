import { desc, eq, or, sql } from "drizzle-orm";
import type { LeadStage } from "@/lib/leads/stage";
import { agencyMeetingColumns, clientMeetingColumns } from "@/server/db/columns";
import type { Database } from "@/server/db/pool";
import { campaign, campaignShare, lead, leadHistory, meeting } from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import type { FynixActor } from "@/server/domain/fynix-write";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { recordMeetingOutcomeSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { insertWithPublicRef } from "@/server/domain/refs";

export interface CreateMeetingInput {
  readonly leadId: string;
  readonly campaignId: string;
  readonly hostMemberId: string;
  readonly scheduledStartTime: Date;
  readonly durationMinutes?: number;
  readonly googleMeetUrl?: string;
  readonly notes?: string;
}

/**
 * Creates and schedules a meeting for a campaign and lead.
 */
export async function scheduleMeeting(
  db: Database,
  deps: Pick<DomainDeps, "randomBytes" | "now">,
  actor: TenantActor,
  input: CreateMeetingInput,
) {
  const now = deps.now();

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const inserted = await insertWithPublicRef(
      tx,
      { prefix: "MTG", constraint: "meeting_public_ref_unique", randomBytes: deps.randomBytes },
      async (inner, publicRef: string) => {
        const [row] = await inner
          .insert(meeting)
          .values({
            publicRef,
            leadId: input.leadId,
            campaignId: input.campaignId,
            hostMemberId: input.hostMemberId,
            scheduledStartTime: input.scheduledStartTime,
            durationMinutes: input.durationMinutes ?? 30,
            googleMeetUrl: input.googleMeetUrl ?? null,
            outcome: "scheduled",
            notes: input.notes ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .returning(actor.orgKind === "client" ? clientMeetingColumns : agencyMeetingColumns);
        return row;
      },
    );

    return inserted;
  });
}

/**
 * Records the outcome of a meeting: held, client_no_show, or prospect_no_show.
 * If held, sets meeting.heldAt = now, updates lead.stage = 'delivered', lead.deliveredAt = now,
 * and appends a record to leadHistory.
 */
export async function recordMeetingOutcome(
  db: Database,
  deps: Pick<DomainDeps, "now">,
  actor: TenantActor,
  input: unknown,
) {
  if (actor.orgKind !== "client" && actor.orgKind !== "agency") {
    throw new DomainError("not-authorised", "Only client or agency members can record meeting outcomes.");
  }

  const parsed = parseInput(recordMeetingOutcomeSchema, input);

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [meetingRow] = await tx
      .select({
        id: meeting.id,
        publicRef: meeting.publicRef,
        leadId: meeting.leadId,
        campaignId: meeting.campaignId,
        outcome: meeting.outcome,
        notes: meeting.notes,
        scheduledStartTime: meeting.scheduledStartTime,
      })
      .from(meeting)
      .where(eq(meeting.id, parsed.meetingId))
      .limit(1);

    if (meetingRow === undefined) {
      throw new DomainError("not-found", "There is no such meeting.");
    }

    const [leadRow] = await tx
      .select({
        id: lead.id,
        stage: lead.stage,
        publicRef: lead.publicRef,
      })
      .from(lead)
      .where(eq(lead.id, meetingRow.leadId))
      .limit(1);

    if (leadRow === undefined) {
      throw new DomainError("not-found", "There is no such lead for this meeting.");
    }

    const now = deps.now();
    const nextStage: LeadStage =
      parsed.outcome === "held"
        ? "delivered"
        : parsed.outcome === "client_no_show"
          ? "client_no_show"
          : "prospect_no_show";

    const [updatedMeeting] = await tx
      .update(meeting)
      .set({
        outcome: parsed.outcome,
        heldAt: parsed.outcome === "held" ? now : null,
        notes: parsed.notes !== undefined ? parsed.notes : meetingRow.notes,
        recordedAt: now,
        recordedByUserId: actor.userId,
        updatedAt: now,
      })
      .where(eq(meeting.id, meetingRow.id))
      .returning(actor.orgKind === "client" ? clientMeetingColumns : agencyMeetingColumns);

    await tx
      .update(lead)
      .set({
        stage: nextStage,
        deliveredAt: parsed.outcome === "held" ? now : null,
        updatedAt: now,
      })
      .where(eq(lead.id, leadRow.id));

    await tx.insert(leadHistory).values({
      leadId: leadRow.id,
      actorUserId: actor.userId,
      actorRole: actor.orgKind,
      action: "meeting.outcome",
      fromStage: leadRow.stage,
      toStage: nextStage,
      note: parsed.notes ?? `Meeting outcome recorded as ${parsed.outcome}`,
      snapshot: { outcome: parsed.outcome, meetingId: meetingRow.id },
      createdAt: now,
    });

    return updatedMeeting;
  });
}

/**
 * Lists all meetings accessible to a client organisation.
 */
export async function listClientMeetings(db: Database, actor: TenantActor) {
  if (actor.orgKind !== "client") {
    throw new DomainError("not-authorised", "Only client members can list client meetings.");
  }

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    return tx
      .select({
        ...clientMeetingColumns,
        prospectName: lead.prospectName,
        prospectCompany: lead.prospectCompany,
        prospectEmail: lead.prospectEmail,
        leadRef: lead.publicRef,
        campaignName: campaign.name,
        campaignRef: campaign.publicRef,
      })
      .from(meeting)
      .innerJoin(lead, eq(meeting.leadId, lead.id))
      .innerJoin(campaign, eq(meeting.campaignId, campaign.id))
      .where(eq(campaign.clientOrgId, actor.orgId))
      .orderBy(desc(meeting.scheduledStartTime));
  });
}

/**
 * Lists all meetings accessible to an agency or supplier organisation.
 */
export async function listAgencyMeetings(db: Database, actor: TenantActor) {
  if (actor.orgKind !== "agency") {
    throw new DomainError("not-authorised", "Only agency or coordinator members can list agency meetings.");
  }

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    return tx
      .select({
        ...agencyMeetingColumns,
        prospectName: lead.prospectName,
        prospectCompany: lead.prospectCompany,
        leadRef: lead.publicRef,
        campaignName: campaign.name,
        campaignRef: campaign.publicRef,
        clientBrandName: campaign.clientBrandName,
      })
      .from(meeting)
      .innerJoin(lead, eq(meeting.leadId, lead.id))
      .innerJoin(campaign, eq(meeting.campaignId, campaign.id))
      .where(
        or(
          eq(campaign.agencyOrgId, actor.orgId),
          eq(lead.sourceOrgId, actor.orgId),
          sql`EXISTS (SELECT 1 FROM ${campaignShare} cs WHERE cs.campaign_id = ${campaign.id} AND cs.agency_org_id = ${actor.orgId})`,
        ),
      )
      .orderBy(desc(meeting.scheduledStartTime));
  });
}

/** Every meeting on every campaign, newest first. Fynix staff read all of them; the Fynix database role has no row filter on meetings. */
export async function listFynixMeetings(db: Database, _actor: FynixActor) {
  return db
    .select({
      ...agencyMeetingColumns,
      prospectName: lead.prospectName,
      prospectCompany: lead.prospectCompany,
      leadRef: lead.publicRef,
      campaignName: campaign.name,
      campaignRef: campaign.publicRef,
      clientBrandName: campaign.clientBrandName,
    })
    .from(meeting)
    .innerJoin(lead, eq(meeting.leadId, lead.id))
    .innerJoin(campaign, eq(meeting.campaignId, campaign.id))
    .orderBy(desc(meeting.scheduledStartTime));
}

/**
 * Retrieves the full details of a specific meeting by public reference.
 */
export async function getMeetingDetails(db: Database, actor: TenantActor, publicRef: string) {
  const cols = actor.orgKind === "client" ? clientMeetingColumns : agencyMeetingColumns;

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [row] = await tx
      .select({
        ...cols,
        prospectName: lead.prospectName,
        prospectCompany: lead.prospectCompany,
        leadRef: lead.publicRef,
        campaignName: campaign.name,
        campaignRef: campaign.publicRef,
      })
      .from(meeting)
      .innerJoin(lead, eq(meeting.leadId, lead.id))
      .innerJoin(campaign, eq(meeting.campaignId, campaign.id))
      .where(eq(meeting.publicRef, publicRef))
      .limit(1);

    if (row === undefined) {
      throw new DomainError("not-found", "There is no such meeting.");
    }

    return row;
  });
}
