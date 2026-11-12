import type { Database } from "@/server/db/pool";
import { withScope, type ScopedTransaction } from "@/server/db/scope";
import { appendAudit, type AuditEntry } from "@/server/domain/audit";

/** The admin the request belongs to: the `user.id` of the signed-in Fynix member. */
export interface FynixActor {
  readonly userId: string;
}

/** What a Fynix write callback gets: the transaction, and the way to append to the audit log inside it. */
export interface FynixWrite {
  readonly tx: ScopedTransaction;
  audit(entry: AuditEntry): Promise<void>;
}

/**
 * The one way a Fynix admin changes anything. It opens the Fynix scope transaction (`app.user_id` is the actor, so the
 * audit rows are in the admin's name) and hands the callback an `audit` function that writes into the same transaction,
 * so a change and its audit row commit together or not at all. If the callback changes a domain table and never calls
 * `audit`, the database refuses the commit (`audit_required`, migration 0012): the rule does not depend on anyone
 * remembering. `db` is the `leads_fynix` database.
 *
 * Services never call `withScope` or `withFynixScope` for a write themselves; a source test (server/domain/boundaries.test.ts)
 * fails if one does.
 */
export async function fynixWrite<T>(db: Database, actor: FynixActor, work: (write: FynixWrite) => Promise<T>): Promise<T> {
  return withScope(db, { orgId: null, userId: actor.userId }, (tx) => work({ tx, audit: (entry) => appendAudit(tx, entry) }));
}

/** A Fynix read: the same scope, no audit. A change made inside it is refused at commit, like any unaudited Fynix change. */
export async function fynixRead<T>(db: Database, actor: FynixActor, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withScope(db, { orgId: null, userId: actor.userId }, work);
}
