"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/fynix/form-state";
import type { DraftActionResult } from "@/lib/tenant/action-state";
import { getSessionContext } from "@/server/auth";
import { getDatabase } from "@/server/db/client";
import { getDomain } from "@/server/domain";
import { discardDraft, saveDraft, updateDraft } from "@/server/domain/lead-drafts";
import { DomainError } from "@/server/domain/errors";
import { draftIdSchema } from "@/server/domain/inputs";
import { draftInput, formText } from "@/server/domain/lead-form-fields";
import { field, runTenantForm } from "@/server/tenant/run-form";

/**
 * Saving a draft from the lead form, and discarding one. A draft needs only a campaign and a prospect name; everything else is checked when it is
 * sent. Public endpoints, so this file exports only actions.
 */

/** Saves the form as a draft: a new one, or an edit when the form carries the id of the draft it was opened from or saved before. */
export async function saveDraftAction(_previous: DraftActionResult, formData: FormData): Promise<DraftActionResult> {
  const context = await getSessionContext();
  if (context === null || context.kind !== "agency") return { status: "error", message: "Only agency or coordinator members can save drafts." };
  const draftId = formText(formData, "draftId");
  const campaignId = formText(formData, "campaignId");
  if (draftId === "" && campaignId === "") return { status: "error", message: "Choose a campaign before saving a draft." };
  if (formText(formData, "prospectName") === "") return { status: "error", message: "Add the prospect's name before saving a draft." };

  try {
    const deps = getDomain();
    const db = getDatabase("leads_agency").db;
    const actor = { userId: context.userId, orgId: context.orgId, orgKind: "agency" as const, role: context.memberRole };
    const saved = draftId === "" ? await saveDraft(db, deps, actor, draftInput(formData, { campaignId })) : await updateDraft(db, deps, actor, draftInput(formData, { leadId: draftId }));
    revalidatePath("/agency/leads");
    revalidatePath("/supplier/leads");
    return { status: "success", message: "Draft saved", leadId: saved.id };
  } catch (error) {
    if (error instanceof DomainError) return { status: "error", message: error.message };
    return { status: "error", message: "Something went wrong while saving the draft." };
  }
}

/** Discards a draft of the signed-in organisation. The lead is kept as withdrawn and never reaches the client. */
export async function discardDraftAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runTenantForm({
    formData,
    fieldNames: [],
    kinds: ["agency"],
    build: () => ({ leadId: field(formData, "leadId") }),
    schema: draftIdSchema,
    labels: {},
    messages: { "invalid-lead-stage": "This draft was sent or discarded already. Refresh the page.", "not-found": "That draft is no longer available. Refresh the page." },
    perform: async (context, input) => {
      if (context.kind !== "agency") return;
      await discardDraft(getDatabase("leads_agency").db, getDomain(), { userId: context.userId, orgId: context.orgId, orgKind: "agency", role: context.memberRole }, input);
    },
    revalidate: ["/agency", "/supplier"],
  });
}
