import { and, desc, eq, notInArray, or, sql } from "drizzle-orm";
import { extractDomainFromEmail, normaliseDomain, normaliseLinkedinUrl } from "@/lib/leads/normalize";
import { type LeadStage } from "@/lib/leads/stage";
import { agencyLeadColumns, clientLeadColumns } from "@/server/db/columns";
import type { Database } from "@/server/db/pool";
import {
  aliasIdentity,
  campaign,
  campaignHost,
  campaignShare,
  lead,
  leadHistory,
  member,
} from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { isProspectExcluded } from "@/server/domain/exclusions";
import { fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import {
  clientReviewLeadSchema,
  disputeLeadSchema,
  resolveDisputeSchema,
  submitLeadSchema,
} from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { insertWithPublicRef } from "@/server/domain/refs";

export interface LeadHistoryRecord {
  readonly id: string;
  readonly leadId: string;
  readonly actorUserId: string;
  readonly actorRole: string;
  readonly action: string;
  readonly fromStage: string | null;
  readonly toStage: string | null;
  readonly note: string | null;
  readonly snapshot: unknown;
  readonly createdAt: Date;
}

export const leadHistoryColumns = {
  id: leadHistory.id,
  leadId: leadHistory.leadId,
  actorUserId: leadHistory.actorUserId,
  actorRole: leadHistory.actorRole,
  action: leadHistory.action,
  fromStage: leadHistory.fromStage,
  toStage: leadHistory.toStage,
  note: leadHistory.note,
  snapshot: leadHistory.snapshot,
  createdAt: leadHistory.createdAt,
};

/**
 * Submits a qualified lead for an active campaign (spec v2 section 8.1).
 * Validates alias verification, exclusions, duplicates, and sets the over-share flag.
 */
export async function submitLead(
  db: Database,
  deps: Pick<DomainDeps, "randomBytes" | "now">,
  actor: TenantActor,
  input: unknown,
) {
  if (actor.orgKind !== "agency") {
    throw new DomainError("not-authorised", "Only agency or supplier members can submit leads.");
  }
  const parsed = parseInput(submitLeadSchema, input);

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    // 1. Verify submitting user is an active member
    const [currentMember] = await tx
      .select({ id: member.id, status: member.status })
      .from(member)
      .where(and(eq(member.userId, actor.userId), eq(member.orgId, actor.orgId)))
      .limit(1);

    if (currentMember === undefined || currentMember.status !== "active") {
      throw new DomainError("not-authorised", "The signed-in user is not an active agency member.");
    }

    // 2. Validate alias identity exists and is verified
    const [aliasRow] = await tx
      .select({
        id: aliasIdentity.id,
        memberId: aliasIdentity.memberId,
        verifiedAt: aliasIdentity.verifiedAt,
      })
      .from(aliasIdentity)
      .where(eq(aliasIdentity.id, parsed.aliasIdentityId))
      .limit(1);

    if (aliasRow === undefined) {
      throw new DomainError("not-found", "There is no such alias identity.");
    }

    if (aliasRow.verifiedAt === null) {
      throw new DomainError("alias-not-verified", "The selected alias identity has not been verified.");
    }

    // 3. Validate campaign exists, is active, and actor org is assigned
    const [campaignRow] = await tx
      .select({
        id: campaign.id,
        clientOrgId: campaign.clientOrgId,
        agencyOrgId: campaign.agencyOrgId,
        status: campaign.status,
        monthlyTarget: campaign.monthlyTarget,
      })
      .from(campaign)
      .where(eq(campaign.id, parsed.campaignId))
      .limit(1);

    if (campaignRow === undefined) {
      throw new DomainError("not-found", "There is no such campaign.");
    }

    if (campaignRow.status !== "active") {
      throw new DomainError("not-authorised", "Cannot submit leads to a campaign that is not active.");
    }

    // Check assignment: actor org is supplier itself, or has a campaign_share record
    const isSupplier = campaignRow.agencyOrgId === actor.orgId;
    const [shareRow] = await tx
      .select({ id: campaignShare.id, monthlyShare: campaignShare.monthlyShare })
      .from(campaignShare)
      .where(and(eq(campaignShare.campaignId, parsed.campaignId), eq(campaignShare.agencyOrgId, actor.orgId)))
      .limit(1);

    if (!isSupplier && shareRow === undefined) {
      throw new DomainError("not-authorised", "Your organisation is not assigned to this campaign.");
    }

    // 4. Validate host member exists and is active on this campaign
    const [hostRow] = await tx
      .select({ memberId: campaignHost.memberId, active: campaignHost.active })
      .from(campaignHost)
      .where(
        and(
          eq(campaignHost.campaignId, parsed.campaignId),
          eq(campaignHost.memberId, parsed.hostMemberId),
          eq(campaignHost.active, true),
        ),
      )
      .limit(1);

    if (hostRow === undefined) {
      throw new DomainError("not-found", "The specified host is not an active host for this campaign.");
    }

    // 5. Check client exclusion list
    const normalizedEmail = parsed.prospectEmail.trim().toLowerCase();
    const fallbackDomain = extractDomainFromEmail(normalizedEmail);
    const normalizedDomain = normaliseDomain(parsed.prospectDomain || fallbackDomain);
    const normalizedLinkedin = normaliseLinkedinUrl(parsed.prospectLinkedinUrl);

    const isExcluded = await isProspectExcluded(tx, campaignRow.clientOrgId, {
      email: normalizedEmail,
      domain: normalizedDomain,
      company: parsed.prospectCompany.trim(),
    });

    if (isExcluded) {
      throw new DomainError("prospect-excluded", "This prospect is on the client exclusion list.");
    }

    // 6. Check duplicates across client campaigns
    const [duplicate] = await tx
      .select({ id: lead.id, publicRef: lead.publicRef })
      .from(lead)
      .innerJoin(campaign, eq(lead.campaignId, campaign.id))
      .where(
        and(
          eq(campaign.clientOrgId, campaignRow.clientOrgId),
          or(
            eq(lead.prospectEmail, normalizedEmail),
            eq(lead.prospectLinkedinUrl, normalizedLinkedin),
          ),
          notInArray(lead.stage, ["withdrawn", "lost", "rejected", "declined"]),
        ),
      )
      .limit(1);

    if (duplicate !== undefined) {
      throw new DomainError(
        "prospect-duplicate",
        `This prospect has already been submitted for this client under reference ${duplicate.publicRef}.`,
      );
    }

    // 7. Check over-share status for the current calendar month
    const now = deps.now();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const targetShare = shareRow?.monthlyShare ?? campaignRow.monthlyTarget;

    const currentSubmissions = await tx
      .select({ id: lead.id })
      .from(lead)
      .where(
        and(
          eq(lead.campaignId, parsed.campaignId),
          eq(lead.sourceOrgId, actor.orgId),
          sql`${lead.submittedAt} >= ${startOfMonth}`,
          notInArray(lead.stage, ["withdrawn", "lost", "rejected"]),
        ),
      );

    const overShare = currentSubmissions.length >= targetShare;

    // 8. Insert lead with LD- public ref
    const created = await insertWithPublicRef(
      tx,
      { prefix: "LD", constraint: "lead_public_ref_unique", randomBytes: deps.randomBytes },
      async (innerTx, ref) => {
        const [row] = await innerTx
          .insert(lead)
          .values({
            publicRef: ref,
            campaignId: parsed.campaignId,
            sourceOrgId: actor.orgId,
            submittedByUserId: actor.userId,
            aliasIdentityId: parsed.aliasIdentityId,
            hostMemberId: parsed.hostMemberId,
            prospectName: parsed.prospectName,
            prospectTitle: parsed.prospectTitle,
            prospectCompany: parsed.prospectCompany,
            prospectDomain: normalizedDomain,
            prospectLinkedinUrl: normalizedLinkedin,
            prospectEmail: normalizedEmail,
            prospectPhone: parsed.prospectPhone ?? null,
            prospectNotes: parsed.prospectNotes ?? null,
            bantBudget: parsed.bantBudget,
            bantAuthority: parsed.bantAuthority,
            bantNeed: parsed.bantNeed,
            bantTimeline: parsed.bantTimeline,
            stage: "awaiting_client",
            proposedTimes: parsed.proposedTimes,
            overShare,
            duplicateOverride: false,
            submittedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .returning(agencyLeadColumns);
        return row;
      },
    );

    if (created === undefined) {
      throw new Error("Insert of lead returned no row");
    }

    // 9. Append immutable history event
    await tx.insert(leadHistory).values({
      leadId: created.id,
      actorUserId: actor.userId,
      actorRole: "agency",
      action: "lead.submit",
      fromStage: null,
      toStage: "awaiting_client",
      note: "Lead submitted with proposed meeting times",
      snapshot: {
        publicRef: created.publicRef,
        campaignId: created.campaignId,
        prospectName: created.prospectName,
        prospectCompany: created.prospectCompany,
        proposedTimes: created.proposedTimes,
        overShare,
      },
      createdAt: now,
    });

    return created;
  });
}

/**
 * Client review action on a lead in awaiting_client stage (spec v2 section 8.2).
 * Actions: accept (moves to scheduled), propose_times, decline.
 */
export async function clientReviewLead(
  db: Database,
  deps: Pick<DomainDeps, "now">,
  actor: TenantActor,
  input: unknown,
) {
  if (actor.orgKind !== "client") {
    throw new DomainError("not-authorised", "Only client members can review leads.");
  }
  const parsed = parseInput(clientReviewLeadSchema, input);

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    // 1. Verify lead belongs to client campaign
    const [leadRow] = await tx
      .select({
        id: lead.id,
        stage: lead.stage,
        campaignId: lead.campaignId,
        publicRef: lead.publicRef,
      })
      .from(lead)
      .innerJoin(campaign, eq(lead.campaignId, campaign.id))
      .where(and(eq(lead.id, parsed.leadId), eq(campaign.clientOrgId, actor.orgId)))
      .limit(1);

    if (leadRow === undefined) {
      throw new DomainError("not-found", "There is no such lead.");
    }

    if (leadRow.stage !== "awaiting_client") {
      throw new DomainError("invalid-lead-stage", "Lead is not awaiting client response.");
    }

    const now = deps.now();

    if (parsed.action === "accept") {
      const [updated] = await tx
        .update(lead)
        .set({
          stage: "scheduled",
          scheduledMeetingTime: new Date(parsed.selectedMeetingTime!),
          scheduledAt: now,
          updatedAt: now,
        })
        .where(eq(lead.id, parsed.leadId))
        .returning(clientLeadColumns);

      await tx.insert(leadHistory).values({
        leadId: leadRow.id,
        actorUserId: actor.userId,
        actorRole: "client",
        action: "lead.accept",
        fromStage: "awaiting_client",
        toStage: "scheduled",
        note: `Meeting time confirmed for ${parsed.selectedMeetingTime}`,
        snapshot: { scheduledMeetingTime: parsed.selectedMeetingTime },
        createdAt: now,
      });

      return updated;
    }

    if (parsed.action === "propose_times") {
      const [updated] = await tx
        .update(lead)
        .set({
          proposedTimes: parsed.proposedTimes!,
          updatedAt: now,
        })
        .where(eq(lead.id, parsed.leadId))
        .returning(clientLeadColumns);

      await tx.insert(leadHistory).values({
        leadId: leadRow.id,
        actorUserId: actor.userId,
        actorRole: "client",
        action: "lead.propose_times",
        fromStage: "awaiting_client",
        toStage: "awaiting_client",
        note: "Client proposed alternative meeting times",
        snapshot: { proposedTimes: parsed.proposedTimes },
        createdAt: now,
      });

      return updated;
    }

    // decline
    const [updated] = await tx
      .update(lead)
      .set({
        stage: "declined",
        declineReason: parsed.declineReason!,
        closedAt: now,
        updatedAt: now,
      })
      .where(eq(lead.id, parsed.leadId))
      .returning(clientLeadColumns);

    await tx.insert(leadHistory).values({
      leadId: leadRow.id,
      actorUserId: actor.userId,
      actorRole: "client",
      action: "lead.decline",
      fromStage: "awaiting_client",
      toStage: "declined",
      note: parsed.declineReason!,
      snapshot: { declineReason: parsed.declineReason },
      createdAt: now,
    });

    return updated;
  });
}

/**
 * Client raises a dispute on a delivered lead within the 48-hour window (spec v2 section 8.3).
 */
export async function disputeLead(
  db: Database,
  deps: Pick<DomainDeps, "now">,
  actor: TenantActor,
  input: unknown,
) {
  if (actor.orgKind !== "client") {
    throw new DomainError("not-authorised", "Only client members can dispute leads.");
  }
  const parsed = parseInput(disputeLeadSchema, input);

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [leadRow] = await tx
      .select({
        id: lead.id,
        stage: lead.stage,
        deliveredAt: lead.deliveredAt,
      })
      .from(lead)
      .innerJoin(campaign, eq(lead.campaignId, campaign.id))
      .where(and(eq(lead.id, parsed.leadId), eq(campaign.clientOrgId, actor.orgId)))
      .limit(1);

    if (leadRow === undefined) {
      throw new DomainError("not-found", "There is no such lead.");
    }

    if (leadRow.stage !== "delivered") {
      throw new DomainError("invalid-lead-stage", "Only delivered leads can be disputed.");
    }

    const now = deps.now();
    const deliveredTime = leadRow.deliveredAt?.getTime() ?? 0;
    const elapsedMs = now.getTime() - deliveredTime;
    const fortyEightHoursMs = 48 * 60 * 60 * 1000;

    if (elapsedMs > fortyEightHoursMs) {
      throw new DomainError("dispute-window-expired", "The 48-hour dispute window has closed.");
    }

    const [updated] = await tx
      .update(lead)
      .set({
        stage: "disputed",
        disputeReason: parsed.disputeReason,
        disputedAt: now,
        updatedAt: now,
      })
      .where(eq(lead.id, parsed.leadId))
      .returning(clientLeadColumns);

    await tx.insert(leadHistory).values({
      leadId: leadRow.id,
      actorUserId: actor.userId,
      actorRole: "client",
      action: "lead.dispute",
      fromStage: "delivered",
      toStage: "disputed",
      note: parsed.disputeReason,
      snapshot: { disputeReason: parsed.disputeReason },
      createdAt: now,
    });

    return updated;
  });
}

/**
 * Fynix resolves a lead dispute: upheld (lead rejected) or rejected (remains delivered).
 */
export async function fynixResolveDispute(
  db: Database,
  deps: Pick<DomainDeps, "now">,
  actor: FynixActor,
  input: unknown,
) {
  const parsed = parseInput(resolveDisputeSchema, input);

  return fynixWrite(db, actor, async ({ tx, audit }) => {
    const [leadRow] = await tx
      .select({
        id: lead.id,
        publicRef: lead.publicRef,
        stage: lead.stage,
      })
      .from(lead)
      .where(eq(lead.id, parsed.leadId))
      .limit(1);

    if (leadRow === undefined) {
      throw new DomainError("not-found", "There is no such lead.");
    }

    if (leadRow.stage !== "disputed") {
      throw new DomainError("invalid-lead-stage", "Only disputed leads can have dispute resolved.");
    }

    const now = deps.now();
    const newStage: LeadStage = parsed.resolution === "upheld" ? "rejected" : "delivered";

    const [updated] = await tx
      .update(lead)
      .set({
        stage: newStage,
        closedAt: parsed.resolution === "upheld" ? now : null,
        updatedAt: now,
      })
      .where(eq(lead.id, parsed.leadId))
      .returning({
        id: lead.id,
        publicRef: lead.publicRef,
        stage: lead.stage,
        updatedAt: lead.updatedAt,
      });

    await tx.insert(leadHistory).values({
      leadId: leadRow.id,
      actorUserId: actor.userId,
      actorRole: "fynix",
      action: "lead.resolve_dispute",
      fromStage: "disputed",
      toStage: newStage,
      note: parsed.note ?? `Dispute ${parsed.resolution}`,
      snapshot: { resolution: parsed.resolution, note: parsed.note },
      createdAt: now,
    });

    await audit({
      action: "lead.resolve_dispute",
      subject: { table: "lead", id: leadRow.id, ref: leadRow.publicRef },
      before: { stage: "disputed" },
      after: { stage: newStage, resolution: parsed.resolution },
    });

    return updated;
  });
}

export function isDisputeWindowOpen(deliveredAt: Date | null, now: Date = new Date()): boolean {
  if (deliveredAt === null) return false;
  return now.getTime() - deliveredAt.getTime() <= 48 * 60 * 60 * 1000;
}

/**
 * Lists leads for a client organisation.
 */
export async function listClientLeads(
  db: Database,
  actor: { readonly userId: string; readonly orgId: string },
  filter?: { readonly stage?: LeadStage; readonly campaignId?: string },
) {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const conditions = [eq(campaign.clientOrgId, actor.orgId)];
    if (filter?.stage !== undefined) {
      conditions.push(eq(lead.stage, filter.stage));
    }
    if (filter?.campaignId !== undefined) {
      conditions.push(eq(lead.campaignId, filter.campaignId));
    }

    const rows = await tx
      .select(clientLeadColumns)
      .from(lead)
      .innerJoin(campaign, eq(lead.campaignId, campaign.id))
      .where(and(...conditions))
      .orderBy(desc(lead.submittedAt));

    const now = new Date();
    return rows.map((r) => ({
      ...r,
      canDispute: r.stage === "delivered" && isDisputeWindowOpen(r.deliveredAt, now),
    }));
  });
}

/**
 * Lists leads for an agency organisation (source agency or supplier).
 */
export async function listAgencyLeads(
  db: Database,
  actor: { readonly userId: string; readonly orgId: string },
  filter?: { readonly stage?: LeadStage; readonly campaignId?: string },
) {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const conditions = [eq(lead.sourceOrgId, actor.orgId)];
    if (filter?.stage !== undefined) {
      conditions.push(eq(lead.stage, filter.stage));
    }
    if (filter?.campaignId !== undefined) {
      conditions.push(eq(lead.campaignId, filter.campaignId));
    }

    const rows = await tx
      .select(agencyLeadColumns)
      .from(lead)
      .where(and(...conditions))
      .orderBy(desc(lead.submittedAt));

    return rows;
  });
}

/**
 * Retrieves lead details and history for client.
 */
export async function getLeadDetailsForClient(
  db: Database,
  actor: { readonly userId: string; readonly orgId: string },
  leadPublicRef: string,
) {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [leadRecord] = await tx
      .select(clientLeadColumns)
      .from(lead)
      .innerJoin(campaign, eq(lead.campaignId, campaign.id))
      .where(and(eq(lead.publicRef, leadPublicRef), eq(campaign.clientOrgId, actor.orgId)))
      .limit(1);

    if (leadRecord === undefined) {
      throw new DomainError("not-found", "There is no such lead.");
    }

    const historyRows = await tx
      .select(leadHistoryColumns)
      .from(leadHistory)
      .where(eq(leadHistory.leadId, leadRecord.id))
      .orderBy(desc(leadHistory.createdAt));

    return {
      lead: leadRecord,
      history: historyRows,
    };
  });
}

/**
 * Retrieves lead details and history for agency.
 */
export async function getLeadDetailsForAgency(
  db: Database,
  actor: { readonly userId: string; readonly orgId: string },
  leadPublicRef: string,
) {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [leadRecord] = await tx
      .select(agencyLeadColumns)
      .from(lead)
      .where(and(eq(lead.publicRef, leadPublicRef), eq(lead.sourceOrgId, actor.orgId)))
      .limit(1);

    if (leadRecord === undefined) {
      throw new DomainError("not-found", "There is no such lead.");
    }

    const historyRows = await tx
      .select(leadHistoryColumns)
      .from(leadHistory)
      .where(eq(leadHistory.leadId, leadRecord.id))
      .orderBy(desc(leadHistory.createdAt));

    return {
      lead: leadRecord,
      history: historyRows,
    };
  });
}

/**
 * Options for submitting a lead: campaigns assigned, verified aliases, active hosts.
 */
export async function getLeadSubmissionOptions(
  db: Database,
  actor: TenantActor,
) {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const supplierCampaigns = await tx
      .select({
        id: campaign.id,
        name: campaign.name,
        clientBrandName: campaign.clientBrandName,
      })
      .from(campaign)
      .where(and(eq(campaign.agencyOrgId, actor.orgId), eq(campaign.status, "active")));

    const shareCampaigns = await tx
      .select({
        id: campaign.id,
        name: campaign.name,
        clientBrandName: campaign.clientBrandName,
      })
      .from(campaign)
      .innerJoin(campaignShare, eq(campaign.id, campaignShare.campaignId))
      .where(and(eq(campaignShare.agencyOrgId, actor.orgId), eq(campaign.status, "active")));

    const campaignMap = new Map<string, { id: string; name: string; clientBrandName: string }>();
    for (const c of [...supplierCampaigns, ...shareCampaigns]) {
      campaignMap.set(c.id, c);
    }
    const campaigns = Array.from(campaignMap.values());

    const aliases = await tx
      .select({
        id: aliasIdentity.id,
        displayName: aliasIdentity.displayName,
        clientBrandName: aliasIdentity.clientBrandName,
        aliasEmail: aliasIdentity.aliasEmail,
      })
      .from(aliasIdentity)
      .where(sql`${aliasIdentity.verifiedAt} IS NOT NULL`);

    const hosts = await tx
      .select({
        id: campaignHost.memberId,
        campaignId: campaignHost.campaignId,
        jobTitle: campaignHost.jobTitle,
      })
      .from(campaignHost)
      .where(eq(campaignHost.active, true));

    return {
      campaigns,
      aliases,
      hosts: hosts.map((h) => ({
        id: h.id,
        name: `Host (${h.jobTitle})`,
        jobTitle: h.jobTitle,
      })),
    };
  });
}

/**
 * Lists leads globally for Fynix operations with campaign details.
 */
export async function listFynixLeads(
  db: Database,
  _actor: FynixActor,
  filter?: { readonly campaignId?: string; readonly stage?: LeadStage },
) {
  const conditions = [];
  if (filter?.campaignId !== undefined) {
    conditions.push(eq(lead.campaignId, filter.campaignId));
  }
  if (filter?.stage !== undefined) {
    conditions.push(eq(lead.stage, filter.stage));
  }

  const rows = await db
    .select({
      id: lead.id,
      publicRef: lead.publicRef,
      campaignId: lead.campaignId,
      campaignName: campaign.name,
      clientBrandName: campaign.clientBrandName,
      prospectName: lead.prospectName,
      prospectTitle: lead.prospectTitle,
      prospectCompany: lead.prospectCompany,
      prospectDomain: lead.prospectDomain,
      prospectEmail: lead.prospectEmail,
      stage: lead.stage,
      scheduledMeetingTime: lead.scheduledMeetingTime,
      overShare: lead.overShare,
      duplicateOverride: lead.duplicateOverride,
      submittedAt: lead.submittedAt,
    })
    .from(lead)
    .innerJoin(campaign, eq(lead.campaignId, campaign.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(lead.submittedAt));

  return rows;
}


