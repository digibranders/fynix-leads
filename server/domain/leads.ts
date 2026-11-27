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
import { requireTeamMember } from "@/server/domain/host-availability";
import { fynixWorkWrite, type FynixActor } from "@/server/domain/fynix-write";
import {
  clientReviewLeadSchema,
  decideLeadSchema,
  overturnRejectionSchema,
  submitLeadSchema,
  type SubmitLeadParsed,
} from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { notify } from "@/server/domain/notices";
import { bookWithInvitations } from "@/server/domain/meeting-invitations";
import { insertWithPublicRef } from "@/server/domain/refs";
import { resolveReview } from "@/server/domain/rejection-reviews";
import { createRoomSafely, type MeetRoom } from "@/server/meet/provider";

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

  // 2. An alias is not asked for any more. One that a caller still sends is checked as before.
  const aliasRow =
    parsed.aliasIdentityId === undefined
      ? undefined
      : (
          await tx
            .select({
              id: aliasIdentity.id,
              memberId: aliasIdentity.memberId,
              verifiedAt: aliasIdentity.verifiedAt,
              clientOrgId: aliasIdentity.clientOrgId,
              status: aliasIdentity.status,
            })
            .from(aliasIdentity)
            .where(eq(aliasIdentity.id, parsed.aliasIdentityId))
            .limit(1)
        )[0];

  if (parsed.aliasIdentityId !== undefined) {
    if (aliasRow === undefined) {
      throw new DomainError("not-found", "There is no such alias identity.");
    }

    if (aliasRow.status !== "active") {
      throw new DomainError("invalid-input", "That alias has been retired.");
    }

    if (aliasRow.verifiedAt === null) {
      throw new DomainError("alias-not-verified", "The selected alias identity has not been verified.");
    }
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

  // An alias is a name used towards one client: it cannot front a lead for another client's campaign. An alias left without a client by the
  // phase 2 backfill (migration 0078) has to be edited to pick its client first.
  if (aliasRow !== undefined) {
    if (aliasRow.clientOrgId === null) {
      throw new DomainError("invalid-input", "That alias has no client yet. Edit it and choose the client first.");
    }
    if (aliasRow.clientOrgId !== campaignRow.clientOrgId) {
      throw new DomainError("invalid-input", "That alias is for a different client than this campaign.");
    }
  }

  // Check assignment: actor org is coordinator itself, or has a campaign_share record
  const isCoordinator = campaignRow.agencyOrgId === actor.orgId;
  const [shareRow] = await tx
    .select({ id: campaignShare.id, monthlyShare: campaignShare.monthlyShare })
    .from(campaignShare)
    .where(and(eq(campaignShare.campaignId, parsed.campaignId), eq(campaignShare.agencyOrgId, actor.orgId)))
    .limit(1);

  if (!isCoordinator && shareRow === undefined) {
    throw new DomainError("not-authorised", "Your organisation is not assigned to this campaign.");
  }

  // 4. The chosen person is an active member of the campaign's client.
  await requireTeamMember(tx, parsed.campaignId, parsed.hostMemberId);

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
  const invitees = parsed.inviteeMemberIds;
  if (invitees !== undefined && (parsed.proposedTimes.length !== 1 || !invitees.includes(parsed.hostMemberId))) {
    throw new DomainError("invalid-input", "Book one time, and invite the person you chose.");
  }

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
            aliasIdentityId: parsed.aliasIdentityId ?? null,
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
            qualificationChecks: parsed.qualificationChecks,
            qualificationNotes: parsed.qualificationNotes,
            stage: invitees === undefined ? "awaiting_client" : "awaiting_reply",
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
      toStage: invitees === undefined ? "awaiting_client" : "awaiting_reply",
      note: invitees === undefined ? "Lead submitted with proposed meeting times" : "Lead submitted with a meeting time for the client team to accept",
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
    if (invitees !== undefined) {
      const slot = parsed.proposedTimes[0];
      if (slot === undefined) throw new DomainError("invalid-input", "Book one time.");
      const booked = await bookWithInvitations(tx, deps, { leadId: created.id, campaignId: created.campaignId, slot, memberIds: invitees, now });
      await notify(tx, { type: "meeting_invited", leadId: created.id, meetingId: booked.meetingId });
    } else {
      await notify(tx, { type: "lead_submitted", leadId: created.id });
    }
    if (overShare) await notify(tx, { type: "lead_over_share", leadId: created.id });

    return created;
  });
}

/**
 * Books the meeting of a lead for a chosen time: one row, with the lead's host. The link is the room the Meet provider made for it (`room`, made before the
 * transaction opened so no request to Google waits inside it), or null when there is none: a Meet link is only ever one Google issued, never one made up here,
 * and the screens say "Link to follow". The room keeps its link through every postponement, because a postponement changes the start time and nothing else.
 * Used when the client picks a time and when Fynix picks it for the client.
 */
export async function bookMeeting(
  tx: ScopedTransaction,
  randomBytes: DomainDeps["randomBytes"],
  leadRow: { readonly id: string; readonly campaignId: string; readonly hostMemberId: string | null },
  time: Date,
  now: Date,
  room: MeetRoom | null = null,
): Promise<string> {
  if (leadRow.hostMemberId === null) throw new DomainError("invalid-lead-stage", "A lead with no client team member chosen cannot be booked.");
  const hostMemberId = leadRow.hostMemberId;
  const booked = await insertWithPublicRef(tx, { prefix: "MTG", constraint: "meeting_public_ref_unique", randomBytes }, async (innerTx, publicRef: string) => {
    const [row] = await innerTx
      .insert(meeting)
      .values({ publicRef, leadId: leadRow.id, campaignId: leadRow.campaignId, hostMemberId, scheduledStartTime: time, durationMinutes: 30, googleMeetUrl: room?.url ?? null, googleSpaceId: room?.spaceId ?? null, outcome: "scheduled", createdAt: now, updatedAt: now })
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
  deps: Pick<DomainDeps, "now" | "randomBytes" | "meet">,
  actor: TenantActor,
  input: unknown,
) {
  if (actor.orgKind !== "client") {
    throw new DomainError("not-authorised", "Only client members can review leads.");
  }
  const parsed = parseInput(clientReviewLeadSchema, input);
  // The room is made before the transaction opens (no request to Google inside it). A failure leaves the meeting with no link; it never fails the booking.
  const room = parsed.action === "accept" ? await createRoomSafely(deps.meet, { startsAt: new Date(parsed.selectedMeetingTime!), durationMinutes: 30 }) : null;

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

      const meetingId = await bookMeeting(tx, deps.randomBytes, { id: leadRow.id, campaignId: leadRow.campaignId, hostMemberId: leadRow.hostMemberId }, new Date(parsed.selectedMeetingTime!), now, room);
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

export * from "@/server/domain/lead-reads";
