import { sessionTooOld, type OrganisationKind } from "@/lib/auth/session-lifetime";
import { readMembership } from "@/server/auth/membership";
import { secondFactorSatisfied, type SecondFactorCheck } from "@/server/auth/second-factor";
import type { Database } from "@/server/db/pool";
import type { TenantRoleName } from "@/server/db/roles";

/** The part of Better Auth that session resolution uses. The real `Auth` fits it; a unit test passes a fake. */
export interface SessionReader {
  readonly api: {
    getSession(input: {
      headers: Headers;
      query: { disableRefresh: true };
    }): Promise<{
      readonly session: { readonly id: string; readonly createdAt: Date };
      readonly user: { readonly id: string; readonly name: string; readonly email?: string; readonly twoFactorEnabled?: boolean | null };
    } | null>;
  };
}

interface SessionContextBase {
  readonly userId: string;
  /** The name on the account, for greeting the person. Not the display name other users see (phase 1C and 1E). */
  readonly name: string;
  /** The sign-in address, read from the session's user row. Shown to the person on their own profile page only. */
  readonly email?: string;
  readonly sessionId: string;
  readonly orgId: string;
  readonly memberRole: "member" | "manager";
  /** Whether the person has turned the second sign-in step on. Read from the session's user row, so no pool needs a grant on the column. */
  readonly twoFactorEnabled?: boolean;
}

/** A signed-in Fynix admin. Runs on the `leads_fynix` pool, which sees every organisation. */
export interface FynixSessionContext extends SessionContextBase {
  readonly kind: "fynix";
  readonly role: "leads_fynix";
}

/** A signed-in client or agency user. Runs on the pool of its own role, scoped to its own organisation. */
export interface TenantSessionContext extends SessionContextBase {
  readonly kind: "client" | "agency";
  readonly role: TenantRoleName;
}

/** Who the request is, resolved from the session cookie: the user, their organisation and its kind, and so the role pool to use. */
export type SessionContext = FynixSessionContext | TenantSessionContext;

export interface SessionResolution {
  readonly reader: SessionReader;
  /** The `leads_auth` database, which may read `member`. */
  readonly authDb: Database;
  readonly now?: () => Date;
  readonly secondFactor?: SecondFactorCheck;
}

function contextFor(kind: OrganisationKind, base: SessionContextBase): SessionContext {
  switch (kind) {
    case "fynix":
      return { ...base, kind, role: "leads_fynix" };
    case "client":
      return { ...base, kind, role: "leads_client" };
    case "agency":
      return { ...base, kind, role: "leads_agency" };
  }
}

/**
 * Session cookie to role pool: session, then member, then organisation kind. Returns `null` (not signed in) when
 * - there is no valid, unexpired session (Better Auth checks the cookie signature, the row and its expiry);
 * - the user belongs to no organisation or the membership is suspended, so a suspension takes effect on the next request;
 * - the session is older than its kind allows, counted from when it was created. Better Auth's own expiry already says
 *   so; this is a second, independent check, so a Fynix session cannot outlive 12 hours through a configuration slip;
 * - the second factor check says no (see server/auth/second-factor.ts).
 * Refresh is off: reading a session never extends it.
 */
export async function resolveSessionContext(deps: SessionResolution, headers: Headers): Promise<SessionContext | null> {
  const found = await deps.reader.api.getSession({ headers, query: { disableRefresh: true } });
  if (found === null) return null;

  const membership = await readMembership(deps.authDb, found.user.id);
  if (membership === null || membership.status !== "active") return null;

  const now = deps.now?.() ?? new Date();
  if (sessionTooOld(membership.orgKind, found.session.createdAt, now)) return null;

  const secondFactor = deps.secondFactor ?? secondFactorSatisfied;
  if (!(await secondFactor({ kind: membership.orgKind, userId: found.user.id, sessionId: found.session.id }))) return null;

  return contextFor(membership.orgKind, { userId: found.user.id, name: found.user.name, ...(found.user.email === undefined ? {} : { email: found.user.email }), sessionId: found.session.id, orgId: membership.orgId, memberRole: membership.role, twoFactorEnabled: found.user.twoFactorEnabled === true });
}
