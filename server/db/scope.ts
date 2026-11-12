import "server-only";
import { sql } from "drizzle-orm";
import { getDatabase } from "@/server/db/client";
import type { Database } from "@/server/db/pool";
import { TENANT_ROLES, type TenantRoleName } from "@/server/db/roles";

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
 * UUIDs: a request with no organisation must not reach a tenant pool at all. The role is checked at runtime as well
 * as by type, so a cast or a value from outside cannot send an organisation scope to the Fynix or owner pool.
 */
export async function withOrgScope<T>(role: TenantRoleName, scope: TenantScope, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  if (!TENANT_ROLES.some((tenantRole) => tenantRole === role)) {
    throw new Error(`withOrgScope needs a tenant role (${TENANT_ROLES.join(" or ")}), not ${String(role)}`);
  }
  if (scope === undefined || scope === null) throw new Error(`A scope is required to use the ${role} pool`);
  assertUuid(scope.orgId, "orgId");
  assertUuid(scope.userId, "userId");
  return withScope(getDatabase(role).db, scope, work);
}

const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Runs `work` as `leads_auth` with one invite in view: the row whose `token_hash` is `tokenHash`, and no other. The policies on
 * `invite` (migration 0014) compare against `app.invite_hash`, so without this a connection sees no invite at all. The
 * hash is the SHA-256 of the token in the link, which only the holder knows. Like the other scopes it is set with
 * `set_config(..., true)`, so it ends with the transaction.
 */
export async function withInviteHash<T>(db: Database, tokenHash: string, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  if (!TOKEN_HASH_PATTERN.test(tokenHash)) throw new Error("tokenHash must be a 43 character base64url SHA-256");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.invite_hash', ${tokenHash}, true)`);
    return work(tx);
  });
}

/** Runs `work` as Fynix. Policies allow every row; the user id is the actor of the audit log (server/domain/fynix-write.ts). */
export async function withFynixScope<T>(scope: FynixScope, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withScope(getDatabase("leads_fynix").db, { orgId: null, userId: scope.userId }, work);
}
