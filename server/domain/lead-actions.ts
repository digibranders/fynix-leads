"use server";

import { revalidatePath } from "next/cache";
import { leadSubmitChecks, retryMessage } from "@/lib/auth/rate-limit-rules";
import { getSessionContext } from "@/server/auth";
import { calendarSetupFromEnv } from "@/server/calendar";
import { assertLiveFree } from "@/server/calendar/live-check";
import { firstBlockedLimit } from "@/server/auth/rate-limit";
import { getDatabase } from "@/server/db/client";
import { getDomain } from "@/server/domain";
import { DomainError } from "@/server/domain/errors";
import { draftInput } from "@/server/domain/lead-form-fields";
import { submitDraft, updateDraft } from "@/server/domain/lead-drafts";
import { submitLead } from "@/server/domain/leads";

export interface TenantActionResult {
  readonly status: "idle" | "success" | "error";
  readonly message?: string;
}

function getField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Server action for agency/coordinator submitting a lead.
 */
export async function submitLeadAction(
  _previous: TenantActionResult,
  formData: FormData,
): Promise<TenantActionResult> {
  const context = await getSessionContext();
  if (context === null || context.kind !== "agency") {
    return { status: "error", message: "Only agency or coordinator members can submit leads." };
  }

  const limits = getDomain();
  const blocked = await firstBlockedLimit(limits.publicDb, leadSubmitChecks(context.userId), limits.now());
  if (blocked !== null) return { status: "error", message: retryMessage(blocked.retryAfterSeconds) };

  const timesRaw = formData.getAll("proposedTimes");
  const proposedTimes = timesRaw.filter((t): t is string => typeof t === "string" && t.length > 0);

  const inviteeMemberIds = formData.getAll("inviteeMemberIds").filter((id): id is string => typeof id === "string" && id.length > 0);

  const input = {
    campaignId: getField(formData, "campaignId"),
    aliasIdentityId: getField(formData, "aliasIdentityId"),
    hostMemberId: getField(formData, "hostMemberId"),
    prospectName: getField(formData, "prospectName"),
    prospectTitle: getField(formData, "prospectTitle"),
    prospectCompany: getField(formData, "prospectCompany"),
    prospectDomain: getField(formData, "prospectDomain"),
    prospectLinkedinUrl: getField(formData, "prospectLinkedinUrl"),
    prospectEmail: getField(formData, "prospectEmail"),
    prospectPhone: getField(formData, "prospectPhone") || undefined,
    prospectNotes: getField(formData, "prospectNotes") || undefined,
    bantBudget: getField(formData, "bantBudget"),
    bantAuthority: getField(formData, "bantAuthority"),
    bantNeed: getField(formData, "bantNeed"),
    bantTimeline: getField(formData, "bantTimeline"),
    proposedTimes,
    inviteeMemberIds: inviteeMemberIds.length === 0 ? undefined : inviteeMemberIds,
  };

  // The choices a person can forget are named in plain words, instead of a field name and a format error.
  if (getField(formData, "draftId") === "") {
    if (input.campaignId === "") return { status: "error", message: "Choose a campaign." };
    if (input.aliasIdentityId === "") return { status: "error", message: "Choose a client alias." };
  }
  // A lead is submitted with one time and the people to invite. The older way, up to three times for the client to choose from, is no longer offered.
  if (proposedTimes.length === 0) return { status: "error", message: "Pick a day and a start time for the meeting." };
  if (inviteeMemberIds.length === 0) return { status: "error", message: "Invite at least one person to the meeting." };

  const draftId = getField(formData, "draftId");
  let editsSaved = false;
  try {
    const deps = getDomain();
    const db = getDatabase("leads_agency").db;
    const actor = {
      userId: context.userId,
      orgId: context.orgId,
      orgKind: "agency" as const,
      role: context.memberRole,
    };

    // The people invited are asked about live, before the booking opens its transaction. Off, or with nobody connected, this does nothing.
    const slot = proposedTimes[0];
    const setup = calendarSetupFromEnv();
    if (setup !== null && slot !== undefined && input.campaignId !== "") {
      await assertLiveFree(db, { authDb: deps.authDb, setup }, actor, { campaignId: input.campaignId, memberIds: inviteeMemberIds, slot: new Date(slot) });
    }
    if (draftId === "") {
      await submitLead(db, deps, actor, input);
    } else {
      // Sending a draft: the form's edits are saved to it first, then the full submission rules run on what it holds.
      await updateDraft(db, deps, actor, draftInput(formData, { leadId: draftId }));
      editsSaved = true;
      await submitDraft(db, deps, actor, { leadId: draftId, inviteeMemberIds: input.inviteeMemberIds });
    }
    revalidatePath("/agency/leads");
    revalidatePath("/coordinator/leads");
    return { status: "success", message: "Lead submitted successfully." };
  } catch (error) {
    if (editsSaved && error instanceof DomainError) {
      return { status: "error", message: `Your changes are saved in the draft, but it was not sent. ${error.message}` };
    }
    if (error instanceof DomainError) {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: "An unexpected error occurred while submitting the lead." };
  }
}
