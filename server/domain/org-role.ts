import { sql } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import { withTenantScope } from "@/server/db/scope";

/** True for a partner agency, false for a supplier: both are `agency` organisations, told apart by whether one sits above them. */
export async function isPartnerAgency(db: Database, actor: { readonly userId: string; readonly orgId: string }): Promise<boolean> {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const result = await tx.execute<{ partner: boolean }>(sql`select public.app_org_is_partner() as partner`);
    return result.rows[0]?.partner === true;
  });
}
