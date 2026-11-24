import { and, eq } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import { member } from "@/server/db/schema";
import { withScope, type ScopedTransaction } from "@/server/db/scope";
import { DomainError } from "@/server/domain/errors";
import { appendAudit, type AuditEntry } from "@/server/domain/audit";

/** The admin the request belongs to: the `user.id` of the signed-in Fynix member. */
export interface FynixActor {
  readonly userId: string;
}

/** What a Fynix write callback gets: the transaction, the actor's own `member.id`, and the way to append to the audit log inside the transaction. */
export interface FynixWrite {
  readonly tx: ScopedTransaction;
  /** The `member.id` of the admin making the change, for columns such as `agreement.created_by`. */
  readonly actorMemberId: string;
  audit(entry: AuditEntry): Promise<void>;
}

/**
 * The one way a Fynix admin changes anything. It opens the Fynix scope transaction (`app.user_id` is the actor, so the
 * audit rows are in the admin's name) and hands the callback an `audit` function that writes into the same transaction,
 * so a change and its audit row commit together or not at all. If the callback changes a domain table and never calls
 * `audit`, the database refuses the commit (`audit_required`, migration 0012): the rule does not depend on anyone
 * remembering.
 *
 * Who may write (phase 1D): an active member of the Fynix organisation whose role is `manager`, a Fynix admin. A member who
 * is not one at all is `not-authorised`; Fynix staff (role `member`) get `admin-required`, which a screen words as "ask an
 * admin". Both are checked first, for a clear error, and again by the database: the audit policy (migration 0018) wants an
 * active Fynix member, and every table Fynix can write has a `fynix_admin_required` trigger (migration 0029) that wants a manager,
 * so a caller that skips this function still cannot change set-up. `db` is the `leads_fynix` database.
 *
 * Every write that exists today is set-up. A later phase in which staff change leads adds its own entry point beside this one,
 * for tables that do not carry the admin trigger.
 *
 * Services never call `withScope` or `withFynixScope` for a write themselves; a source test (server/domain/boundaries.test.ts)
 * fails if one does.
 */
export async function fynixWrite<T>(db: Database, actor: FynixActor, work: (write: FynixWrite) => Promise<T>): Promise<T> {
  return withScope(db, { orgId: null, userId: actor.userId }, async (tx) => {
    const [active] = await tx
      .select({ id: member.id, role: member.role })
      .from(member)
      .where(and(eq(member.userId, actor.userId), eq(member.orgKind, "fynix"), eq(member.status, "active")))
      .limit(1);
    if (active === undefined) throw new DomainError("not-authorised", "The signed-in user is not an active member of Fynix.");
    if (active.role !== "manager") throw new DomainError("admin-required", "Only a Fynix admin can change set-up; Fynix staff can read it.");
    return work({ tx, actorMemberId: active.id, audit: (entry) => appendAudit(tx, entry) });
  });
}

/** A Fynix read: the same scope, no audit, open to staff as well as admins. A change made inside it is refused at commit, like any unaudited Fynix change. */
export async function fynixRead<T>(db: Database, actor: FynixActor, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withScope(db, { orgId: null, userId: actor.userId }, work);
}

/**
 * A Fynix change that any active Fynix member may make to their own record, staff as well as admins: the profile page. It is `fynixWrite` without the admin
 * rule, and it is for nothing else. The change itself is made by a database function that finds the row by the account in the scope (migration 0062), so
 * the callback never names a row; it still has to audit, because the database refuses the commit of an unaudited Fynix change.
 */
export async function fynixSelfWrite<T>(db: Database, actor: FynixActor, work: (write: FynixWrite) => Promise<T>): Promise<T> {
  return withScope(db, { orgId: null, userId: actor.userId }, async (tx) => {
    const [active] = await tx
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.userId, actor.userId), eq(member.orgKind, "fynix"), eq(member.status, "active")))
      .limit(1);
    if (active === undefined) throw new DomainError("not-authorised", "The signed-in user is not an active member of Fynix.");
    return work({ tx, actorMemberId: active.id, audit: (entry) => appendAudit(tx, entry) });
  });
}

/**
 * A Fynix change to the work tables (leads, meetings, their history), which any active Fynix member may make, staff as well as admins: staff work
 * leads, meetings and rejections (lead flow decision, "Fynix roles"). It is `fynixWrite` without the admin rule and for nothing else: those tables
 * carry the audit trigger but not the admin trigger (migration 0029 left them out), so the database agrees. The callback still has to audit.
 */
export async function fynixWorkWrite<T>(db: Database, actor: FynixActor, work: (write: FynixWrite) => Promise<T>): Promise<T> {
  return fynixSelfWrite(db, actor, work);
}
