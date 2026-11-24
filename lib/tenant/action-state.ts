/**
 * The starting state of a tenant form action. It lives here, not in the "use server" files, because a "use server" file may only
 * export async functions: exporting this object from there makes Next.js refuse to load the actions, and every form that
 * posts through them fails with "Something went wrong".
 */
export interface TenantActionResult {
  readonly status: "idle" | "success" | "error";
  readonly message?: string;
}

export const IDLE_TENANT_ACTION: TenantActionResult = { status: "idle" };

/** What saving a draft answers: the draft's id too, so the next save edits the same draft instead of making another. */
export interface DraftActionResult extends TenantActionResult {
  readonly leadId?: string;
}

export const IDLE_DRAFT_ACTION: DraftActionResult = { status: "idle" };
