import "server-only";
import type { SessionContext } from "@/server/auth/session-context";
import { withFynixScope, withOrgScope, type ScopedTransaction } from "@/server/db/scope";

/**
 * Runs `work` as the signed-in user: on the Fynix pool for a Fynix admin, on the client or agency pool, scoped to the
 * user's own organisation, for everyone else. This is the one place a resolved session picks a database role, and it
 * goes through the same scope helpers as everything else, so every tenant request sets `app.org_id` and `app.user_id`
 * for exactly one transaction.
 */
export function withSessionScope<T>(context: SessionContext, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  if (context.kind === "fynix") return withFynixScope({ userId: context.userId }, work);
  return withOrgScope(context.role, { orgId: context.orgId, userId: context.userId }, work);
}
