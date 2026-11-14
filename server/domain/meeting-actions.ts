"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/server/auth";
import { getDatabase } from "@/server/db/client";
import { getDomain } from "@/server/domain";
import { DomainError } from "@/server/domain/errors";
import { recordMeetingOutcome } from "@/server/domain/meetings";

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
 * Server action for recording a meeting outcome (held, client_no_show, prospect_no_show).
 */
export async function recordMeetingOutcomeAction(
  _previous: TenantActionResult,
  formData: FormData,
): Promise<TenantActionResult> {
  const context = await getSessionContext();
  if (context === null || (context.kind !== "client" && context.kind !== "agency")) {
    return { status: "error", message: "Only client or agency members can record meeting outcomes." };
  }

  const meetingId = getField(formData, "meetingId");
  const outcome = getField(formData, "outcome");
  const notes = getField(formData, "notes") || undefined;

  const roleName = context.kind === "client" ? "leads_client" : "leads_agency";
  const db = getDatabase(roleName).db;
  const deps = getDomain();

  const actor = {
    userId: context.userId,
    orgId: context.orgId,
    orgKind: context.kind,
    role: context.memberRole,
  };

  try {
    await recordMeetingOutcome(db, deps, actor, { meetingId, outcome, notes });
    revalidatePath("/client/meetings");
    revalidatePath("/agency/meetings");
    revalidatePath("/supplier/meetings");
    revalidatePath("/client/leads");
    revalidatePath("/agency/leads");
    revalidatePath("/supplier/leads");
    return { status: "success", message: `Meeting marked as ${outcome}.` };
  } catch (error) {
    if (error instanceof DomainError) {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: "An unexpected error occurred while recording outcome." };
  }
}
