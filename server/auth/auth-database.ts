import type { Database } from "@/server/db/pool";

/**
 * What Better Auth and the membership read need from a database: the four statement builders. A pooled `leads_auth`
 * database fits, and so does a transaction on it (`Database["transaction"]`'s callback argument). Invite redemption runs
 * Better Auth on a transaction so the new account, the membership and the acceptance of the terms commit together or not
 * at all (server/domain/redeem-invite.ts).
 */
export type AuthDatabase = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">;
