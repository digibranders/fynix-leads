import "server-only";
import { sql } from "drizzle-orm";
import { getDatabase } from "@/server/db/client";
import type { Database } from "@/server/db/pool";
import type { TenantRoleName } from "@/server/db/roles";

/**
 * The transaction passed to the callbacks below. The type alone does not prove a scope was set: a plain
 * `db.transaction()` callback has the same type. Inside `work`, always use `tx`; the outer `db` is another pooled
 * connection with no scope.
 */
export type ScopedTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** What a client or agency request runs as: its organisation, and the signed-in user. */
export interface TenantScope {
  readonly orgId: string;
  readonly userId: string;
}

/** What a Fynix admin request runs as. Fynix sees every organisation, so there is no organisation to scope to. */
export interface FynixScope {
  readonly userId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres would reject a malformed id deep inside a policy; fail early with a clear message instead. Never echoes the value. */
export function assertUuid(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`${name} must be a UUID`);
  }
}

/**
 * Runs `work` in one transaction with the scope set for that transaction only (`set_config(..., true)`), so the
 * setting disappears at commit or rollback, including after an error, and cannot leak to the next request that
 * reuses the pooled connection. An empty organisation id means "no organisation": policies compare against NULL.
 */
export async function withScope<T>(
  db: Database,
  scope: { readonly orgId: string | null; readonly userId: string },
  work: (tx: ScopedTransaction) => Promise<T>,
): Promise<T> {
  assertUuid(scope.userId, "userId");
  if (scope.orgId !== null) assertUuid(scope.orgId, "orgId");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${scope.orgId ?? ""}, true), set_config('app.user_id', ${scope.userId}, true)`);
    return work(tx);
  });
}

/**
 * Runs `work` as the client or agency role, scoped to one organisation and user. Both ids are required and must be
 * UUIDs: a request with no organisation must not reach a tenant pool at all.
 */
export async function withOrgScope<T>(role: TenantRoleName, scope: TenantScope, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  if (scope === undefined || scope === null) throw new Error(`A scope is required to use the ${role} pool`);
  assertUuid(scope.orgId, "orgId");
  assertUuid(scope.userId, "userId");
  return withScope(getDatabase(role).db, scope, work);
}

/** Runs `work` as Fynix. Policies allow every row; the user id is for the audit log phase 1C adds. */
export async function withFynixScope<T>(scope: FynixScope, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withScope(getDatabase("leads_fynix").db, { orgId: null, userId: scope.userId }, work);
}
