import type { PgColumn } from "drizzle-orm/pg-core";
import { campaign, organisation } from "@/server/db/schema";
import type { TenantRoleName } from "@/server/db/roles";

/**
 * The columns each tenant role may read, one typed list per role and table. A tenant role has no table-level SELECT,
 * so a Drizzle select with no column list fails for it by design; every tenant read passes one of these lists instead.
 *
 * The lists mirror the GRANT statements in the hand-written migrations. Two tests keep them honest:
 * columns.test.ts proves a list never contains a forbidden column, and rls.integration.test.ts proves each list is
 * exactly what the database granted. Changing a grant means changing the list in the same commit.
 */
const tenantOrganisationColumns = {
  publicRef: organisation.publicRef,
  kind: organisation.kind,
  name: organisation.name,
  brandName: organisation.brandName,
} as const;

const tenantCampaignColumns = {
  id: campaign.id,
  publicRef: campaign.publicRef,
  name: campaign.name,
  clientBrandName: campaign.clientBrandName,
  status: campaign.status,
  startDate: campaign.startDate,
  endDate: campaign.endDate,
  monthlyTarget: campaign.monthlyTarget,
  totalTarget: campaign.totalTarget,
} as const;

/** Separate constants per role, so a later phase can give the roles different columns without touching the other. */
export const clientOrganisationColumns = { ...tenantOrganisationColumns } as const;
export const agencyOrganisationColumns = { ...tenantOrganisationColumns } as const;
export const clientCampaignColumns = { ...tenantCampaignColumns } as const;
export const agencyCampaignColumns = { ...tenantCampaignColumns } as const;

export const TENANT_COLUMNS = {
  leads_client: { organisation: clientOrganisationColumns, campaign: clientCampaignColumns },
  leads_agency: { organisation: agencyOrganisationColumns, campaign: agencyCampaignColumns },
} as const satisfies Record<TenantRoleName, { organisation: Record<string, PgColumn>; campaign: Record<string, PgColumn> }>;

/** The database column names in a list, for comparing with the catalog. */
export function columnNames(columns: Readonly<Record<string, PgColumn>>): string[] {
  return Object.values(columns).map((column) => column.name);
}
