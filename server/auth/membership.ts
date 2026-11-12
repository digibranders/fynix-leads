import { eq } from "drizzle-orm";
import type { OrganisationKind } from "@/lib/auth/session-lifetime";
import type { Database } from "@/server/db/pool";
import { member } from "@/server/db/schema";

/** What session resolution needs to know about a user: which organisation, of what kind, in what role, active or not. */
export interface Membership {
  readonly userId: string;
  readonly orgId: string;
  readonly orgKind: OrganisationKind;
  readonly role: "member" | "manager";
  readonly status: "active" | "suspended";
}

/**
 * The membership of one user, or `null` when the user belongs to no organisation. Run it with the `leads_auth`
 * database: that role may read exactly these five columns of `member` and nothing else on it, and the column list below
 * is the same five (a `select()` with no columns would be refused).
 */
export async function readMembership(db: Database, userId: string): Promise<Membership | null> {
  const rows = await db
    .select({ userId: member.userId, orgId: member.orgId, orgKind: member.orgKind, role: member.role, status: member.status })
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}
