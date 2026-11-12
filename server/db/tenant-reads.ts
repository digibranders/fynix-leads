import { TENANT_COLUMNS } from "@/server/db/columns";
import type { TenantRoleName } from "@/server/db/roles";
import { campaign, organisation } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";

/**
 * The only way tenant code starts a read of these tables. Each helper passes the role's column list, so a tenant query
 * never says `select()` with no columns, which the database refuses. They return the Drizzle query, so a caller can
 * still add `.where(...)`, `.orderBy(...)` and `.limit(...)` on columns the role may read.
 */
export function selectOrganisations(tx: ScopedTransaction, role: TenantRoleName) {
  return tx.select(TENANT_COLUMNS[role].organisation).from(organisation);
}

export function selectCampaigns(tx: ScopedTransaction, role: TenantRoleName) {
  return tx.select(TENANT_COLUMNS[role].campaign).from(campaign);
}
