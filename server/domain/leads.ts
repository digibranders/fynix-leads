import {
  and,
  eq,
  ne,
  notInArray,
  sql,
} from "drizzle-orm";
import { lateRejectionCounts } from "@/lib/domain/counting-month";
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
  meeting,
  member,
} from "@/server/db/schema";
import { withTenantScope, type ScopedTransaction } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixWorkWrite, fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import {
  clientReviewLeadSchema,
  decideLeadSchema,
  disputeLeadSchema,
  overturnRejectionSchema,
  resolveDisputeSchema,
  submitLeadSchema,
  type SubmitLeadParsed,
} from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { notify } from "@/server/domain/notices";
import { insertWithPublicRef } from "@/server/domain/refs";
import { resolveReview } from "@/server/domain/rejection-reviews";

/** The checks every submission passes, a new lead or a draft sent on: the member, the alias, the campaign and the organisation's place on it, the host, the exclusion list, duplicates and the over-share flag. */
export async function checkSubmission(
  tx: ScopedTransaction,
  deps: Pick<DomainDeps, "now">,
  actor: TenantActor,
  parsed: SubmitLeadParsed,
  excludeLeadId?: string,
) {
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
      clientBrandName: aliasIdentity.clientBrandName,
      clientOrgId: aliasIdentity.clientOrgId,
      status: aliasIdentity.status,
    })
    .from(aliasIdentity)
    .where(eq(aliasIdentity.id, parsed.aliasIdentityId))
    .limit(1);

  if (aliasRow === undefined) {
    throw new DomainError("not-found", "There is no such alias identity.");
  }

  if (aliasRow.status !== "active") {
    throw new DomainError("invalid-input", "That alias has been retired.");
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
      clientBrandName: campaign.clientBrandName,
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

  // An alias is a name used towards one client's brand: it cannot front a lead for another client's campaign.
  // An alias made since phase 2 names its client; an older one is matched by brand.
  const sameClient = aliasRow.clientOrgId !== null ? aliasRow.clientOrgId === campaignRow.clientOrgId : aliasRow.clientBrandName.trim().toLowerCase() === campaignRow.clientBrandName.trim().toLowerCase();
  if (!sameClient) {
    throw new DomainError("invalid-input", "That alias is for a different client brand than this campaign.");
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

  // Both checks read rows an agency may not see (the client's exclusion list, other agencies' leads), so they run as
  // database functions that answer a boolean or a reference and nothing else (migration 0042).
  const excludedResult = await tx.execute<{ excluded: boolean }>(
    sql`select public.app_prospect_excluded(${campaignRow.clientOrgId}::uuid, ${normalizedEmail}, ${normalizedDomain}, ${parsed.prospectCompany.trim()}) as excluded`,
  );
  if (excludedResult.rows[0]?.excluded === true) {
    throw new DomainError("prospect-excluded", "This prospect is on the client exclusion list.");
  }

  // 6. Check duplicates across client campaigns
  const duplicateResult = await tx.execute<{ ref: string | null }>(
    sql`select public.app_find_duplicate_lead(${campaignRow.clientOrgId}::uuid, ${normalizedEmail}, ${normalizedLinkedin}) as ref`,
  );
  const duplicateRef = duplicateResult.rows[0]?.ref ?? null;
  if (duplicateRef !== null) {
    throw new DomainError(
      "prospect-duplicate",
      duplicateRef === "OTHER"
        ? "This prospect has already been submitted for this client."
        : `This prospect has already been submitted for this client under reference ${duplicateRef}.`,
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
        notInArray(lead.stage, ["draft", "withdrawn", "lost", "rejected"]),
        ...(excludeLeadId === undefined ? [] : [ne(lead.id, excludeLeadId)]),
      ),
    );

  const overShare = currentSubmissions.length >= targetShare;

  return { normalizedEmail, normalizedDomain, normalizedLinkedin, overShare, now };
}

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
    throw new DomainError("not-authorised", "Only agency or coordinator members can submit leads.");
  }
  const parsed = parseInput(submitLeadSchema, input);

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const checked = await checkSubmission(tx, deps, actor, parsed);
    const { normalizedEmail, normalizedDomain, normalizedLinkedin, overShare, now } = checked;

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
    await notify(tx, { type: "lead_submitted", leadId: created.id });

    return created;
  });
}

/**
 * Books the meeting of a lead for a chosen time: one row, with the lead's host and no link (a Meet room is only ever one Google issued, so it is null
 * until a host adds a real one). Used when the client picks a time and when Fynix picks it for the client.
 */
export async function bookMeeting(
  tx: ScopedTransaction,
  randomBytes: DomainDeps["randomBytes"],
  leadRow: { readonly id: string; readonly campaignId: string; readonly hostMemberId: string | null },
  time: Date,
  now: Date,
): Promise<string> {
  if (leadRow.hostMemberId === null) throw new DomainError("invalid-lead-stage", "A lead with no host cannot be booked.");
  const hostMemberId = leadRow.hostMemberId;
  const booked = await insertWithPublicRef(tx, { prefix: "MTG", constraint: "meeting_public_ref_unique", randomBytes }, async (innerTx, publicRef: string) => {
    const [row] = await innerTx
      .insert(meeting)
      .values({ publicRef, leadId: leadRow.id, campaignId: leadRow.campaignId, hostMemberId, scheduledStartTime: time, durationMinutes: 30, googleMeetUrl: null, outcome: "scheduled", createdAt: now, updatedAt: now })
      .returning({ id: meeting.id });
    return row;
  });
  if (booked === undefined) throw new Error("Insert of meeting returned no row");
  return booked.id;
}

/**
 * Client review action on a lead in awaiting_client stage (spec v2 section 8.2).
 * Actions: accept (moves to scheduled), propose_times, decline.
 */
export async function clientReviewLead(
  db: Database,
  deps: Pick<DomainDeps, "now" | "randomBytes">,
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
        hostMemberId: lead.hostMemberId,
        publicRef: lead.publicRef,
        scheduledMeetingTime: lead.scheduledMeetingTime,
      })
      .from(lead)
      .innerJoin(campaign, eq(lead.campaignId, campaign.id))
      .where(and(eq(lead.id, parsed.leadId), eq(campaign.clientOrgId, actor.orgId)))
      .limit(1);

    if (leadRow === undefined) {
      throw new DomainError("not-found", "There is no such lead.");
    }

    // The client may reject at any time before the meeting: while it picks a time and once a time is booked. Picking a time and
    // proposing others are for a lead that still waits for it.
    const canReject = leadRow.stage === "awaiting_client" || leadRow.stage === "scheduled";
    if (parsed.action === "decline" ? !canReject : leadRow.stage !== "awaiting_client") {
      throw new DomainError("invalid-lead-stage", parsed.action === "decline" ? "A lead can be rejected before its meeting only." : "Lead is not awaiting client response.");
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

      const meetingId = await bookMeeting(tx, deps.randomBytes, { id: leadRow.id, campaignId: leadRow.campaignId, hostMemberId: leadRow.hostMemberId }, new Date(parsed.selectedMeetingTime!), now);
      await notify(tx, { type: "meeting_scheduled", leadId: leadRow.id, meetingId });

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
      await notify(tx, { type: "times_proposed", leadId: leadRow.id });

      return updated;
    }

    // Reject before the meeting, with a required note. It counts zero, whenever it is made (see `lateRejectionCounts`).
    const note = parsed.declineReason!;
    const [updated] = await tx
      .update(lead)
      .set({
        stage: "declined",
        declineReason: note,
        decisionNote: note,
        decisionAt: now,
        decisionByUserId: actor.userId,
        decisionSource: "client",
        closedAt: now,
        updatedAt: now,
      })
      .where(eq(lead.id, parsed.leadId))
      .returning(clientLeadColumns);

    // A booked meeting will not happen.
    if (leadRow.stage === "scheduled") {
      await tx.update(meeting).set({ outcome: "cancelled", updatedAt: now }).where(and(eq(meeting.leadId, leadRow.id), eq(meeting.outcome, "scheduled")));
    }

    await tx.insert(leadHistory).values({
      leadId: leadRow.id,
      actorUserId: actor.userId,
      actorRole: "client",
      action: "lead.decline",
      fromStage: leadRow.stage,
      toStage: "declined",
      note,
      snapshot: {
        declineReason: note,
        ...(leadRow.scheduledMeetingTime === null ? {} : { countsAsOne: lateRejectionCounts(leadRow.scheduledMeetingTime, now) }),
      },
      createdAt: now,
    });
    await notify(tx, { type: "rejected_before_meeting", by: "client", note, leadId: leadRow.id });

    return updated;
  });
}

/**
 * The client's answer after the meeting: accept or reject, with a required note both ways. Accepted counts one (`delivered_at` is the
 * counted-at moment), rejected counts zero and closes the lead. Only a lead in `awaiting_decision` can be answered; the 48 hour sweep and a
 * person pressing at once cannot both win, because the update names the stage it expects.
 */
export async function decideLead(
  db: Database,
  deps: Pick<DomainDeps, "now">,
  actor: TenantActor,
  input: unknown,
) {
  if (actor.orgKind !== "client") {
    throw new DomainError("not-authorised", "Only client members can accept or reject a lead.");
  }
  const parsed = parseInput(decideLeadSchema, input);

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [leadRow] = await tx
      .select({ id: lead.id, stage: lead.stage })
      .from(lead)
      .innerJoin(campaign, eq(lead.campaignId, campaign.id))
      .where(and(eq(lead.id, parsed.leadId), eq(campaign.clientOrgId, actor.orgId)))
      .limit(1);
    if (leadRow === undefined) throw new DomainError("not-found", "There is no such lead.");
    if (leadRow.stage !== "awaiting_decision") throw new DomainError("invalid-lead-stage", "Only a lead whose meeting has been held can be accepted or rejected.");

    const now = deps.now();
    const accepted = parsed.decision === "accept";
    const nextStage: LeadStage = accepted ? "accepted" : "rejected";
    const [updated] = await tx
      .update(lead)
      .set({
        stage: nextStage,
        decisionNote: parsed.note,
        decisionAt: now,
        decisionByUserId: actor.userId,
        decisionSource: "client",
        deliveredAt: accepted ? now : null,
        closedAt: accepted ? null : now,
        updatedAt: now,
      })
      .where(and(eq(lead.id, leadRow.id), eq(lead.stage, "awaiting_decision")))
      .returning(clientLeadColumns);
    if (updated === undefined) throw new DomainError("invalid-lead-stage", "This lead has been answered already.");

    await tx.insert(leadHistory).values({
      leadId: leadRow.id,
      actorUserId: actor.userId,
      actorRole: "client",
      action: accepted ? "lead.decide_accept" : "lead.decide_reject",
      fromStage: "awaiting_decision",
      toStage: nextStage,
      note: parsed.note,
      snapshot: { decision: parsed.decision },
      createdAt: now,
    });
    await notify(tx, { type: accepted ? "lead_accepted" : "lead_rejected", by: "client", note: parsed.note, leadId: leadRow.id });

    return updated;
  });
}

/**
 * Fynix changes a rejection to accepted, with its own note, within any time. The lead counts one, in the month of its meeting. The client's
 * note stays in the lead's history; the lead now carries Fynix's. Open to admin and staff, with an audit row.
 */
export async function fynixOverturnRejection(db: Database, deps: Pick<DomainDeps, "now">, actor: FynixActor, input: unknown) {
  const parsed = parseInput(overturnRejectionSchema, input);

  return fynixWorkWrite(db, actor, async ({ tx, audit }) => {
    const [leadRow] = await tx.select({ id: lead.id, publicRef: lead.publicRef, stage: lead.stage }).from(lead).where(eq(lead.id, parsed.leadId)).limit(1);
    if (leadRow === undefined) throw new DomainError("not-found", "There is no such lead.");
    if (leadRow.stage !== "rejected") throw new DomainError("invalid-lead-stage", "Only a lead the client rejected after the meeting can be changed to accepted.");

    const now = deps.now();
    const [updated] = await tx
      .update(lead)
      .set({
        stage: "accepted",
        decisionNote: parsed.note,
        decisionAt: now,
        decisionByUserId: actor.userId,
        decisionSource: "fynix",
        deliveredAt: now,
        closedAt: null,
        rejectionReviewedAt: now,
        updatedAt: now,
      })
      .where(and(eq(lead.id, leadRow.id), eq(lead.stage, "rejected")))
      .returning({ id: lead.id, publicRef: lead.publicRef, stage: lead.stage, decisionNote: lead.decisionNote, decisionSource: lead.decisionSource, updatedAt: lead.updatedAt });
    if (updated === undefined) throw new DomainError("invalid-lead-stage", "This lead was changed by someone else. Refresh the page.");

    await resolveReview(tx, leadRow.id, now);
    await tx.insert(leadHistory).values({
      leadId: leadRow.id,
      actorUserId: actor.userId,
      actorRole: "fynix",
      action: "lead.overturn_rejection",
      fromStage: "rejected",
      toStage: "accepted",
      note: parsed.note,
      snapshot: { decision: "overturned" },
      createdAt: now,
    });
    await notify(tx, { type: "rejection_overturned", note: parsed.note, leadId: leadRow.id });

    await audit({
      action: "lead.overturn_rejection",
      subject: { table: "lead", id: leadRow.id, ref: leadRow.publicRef },
      before: { stage: "rejected" },
      after: { stage: "accepted", decisionSource: "fynix" },
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


export * from "@/server/domain/lead-reads";
