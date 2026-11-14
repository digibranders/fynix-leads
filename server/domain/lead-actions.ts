"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/server/auth";
import { getDatabase } from "@/server/db/client";
import { getDomain } from "@/server/domain";
import { DomainError } from "@/server/domain/errors";
import {
  clientReviewLead,
  disputeLead,
  submitLead,
} from "@/server/domain/leads";

export interface TenantActionResult {
  readonly status: "idle" | "success" | "error";
  readonly message?: string;
}

export const IDLE_TENANT_ACTION: TenantActionResult = { status: "idle" };

function getField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Server action for agency/supplier submitting a lead.
 */
export async function submitLeadAction(
  _previous: TenantActionResult,
  formData: FormData,
): Promise<TenantActionResult> {
  const context = await getSessionContext();
  if (context === null || context.kind !== "agency") {
    return { status: "error", message: "Only agency or supplier members can submit leads." };
  }

  const timesRaw = formData.getAll("proposedTimes");
  const proposedTimes = timesRaw.filter((t): t is string => typeof t === "string" && t.length > 0);

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
  };

  try {
    const deps = getDomain();
    const db = getDatabase("leads_agency").db;
    const actor = {
      userId: context.userId,
      orgId: context.orgId,
      orgKind: "agency" as const,
      role: context.memberRole,
    };

    await submitLead(db, deps, actor, input);
    revalidatePath("/agency/leads");
    revalidatePath("/supplier/leads");
    return { status: "success", message: "Lead submitted successfully." };
  } catch (error) {
    if (error instanceof DomainError) {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: "An unexpected error occurred while submitting the lead." };
  }
}

/**
 * Server action for client reviewing a lead: accept, propose times, or decline.
 */
export async function clientReviewLeadAction(
  _previous: TenantActionResult,
  formData: FormData,
): Promise<TenantActionResult> {
  const context = await getSessionContext();
  if (context === null || context.kind !== "client") {
    return { status: "error", message: "Only client members can review leads." };
  }

  const action = getField(formData, "action") as "accept" | "propose_times" | "decline";
  const selectedTime = getField(formData, "selectedMeetingTime");
  const declineReason = getField(formData, "declineReason");
  const timesRaw = formData.getAll("proposedTimes");
  const proposedTimes = timesRaw.filter((t): t is string => typeof t === "string" && t.length > 0);

  const input = {
    leadId: getField(formData, "leadId"),
    action,
    selectedMeetingTime: selectedTime || undefined,
    proposedTimes: proposedTimes.length > 0 ? proposedTimes : undefined,
    declineReason: declineReason || undefined,
  };

  try {
    const deps = getDomain();
    const db = getDatabase("leads_client").db;
    const actor = {
      userId: context.userId,
      orgId: context.orgId,
      orgKind: "client" as const,
      role: context.memberRole,
    };

    await clientReviewLead(db, deps, actor, input);
    revalidatePath("/client/review");
    revalidatePath("/client/leads");
    return { status: "success", message: `Lead review completed (${action}).` };
  } catch (error) {
    if (error instanceof DomainError) {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: "An unexpected error occurred while reviewing the lead." };
  }
}

/**
 * Server action for client raising a dispute on a delivered lead within 48h.
 */
export async function disputeLeadAction(
  _previous: TenantActionResult,
  formData: FormData,
): Promise<TenantActionResult> {
  const context = await getSessionContext();
  if (context === null || context.kind !== "client") {
    return { status: "error", message: "Only client members can dispute leads." };
  }

  const input = {
    leadId: getField(formData, "leadId"),
    disputeReason: getField(formData, "disputeReason"),
  };

  try {
    const deps = getDomain();
    const db = getDatabase("leads_client").db;
    const actor = {
      userId: context.userId,
      orgId: context.orgId,
      orgKind: "client" as const,
      role: context.memberRole,
    };

    await disputeLead(db, deps, actor, input);
    revalidatePath("/client/leads");
    return { status: "success", message: "Dispute submitted successfully." };
  } catch (error) {
    if (error instanceof DomainError) {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: "An unexpected error occurred while submitting the dispute." };
  }
}
