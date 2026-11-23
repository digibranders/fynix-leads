import type { TenantRoleName } from "@/server/db/roles";

/** The six phase 1D set-up tables. */
export const SETUP_TABLES = ["agreement", "agreement_acceptance", "campaign_share", "campaign_host", "host_hours", "host_block"] as const;
export type SetupTable = (typeof SETUP_TABLES)[number];

/**
 * Phases 1E to 5 opened the set-up tables to tenant roles by column grant. Per role and table: the columns it cannot read, the columns it
 * may update, whether it may insert every column (the ORM lists them all) except the `*_org_kind` column a trigger fills, and whether it
 * holds the table-level DELETE (DELETE has no column form). A role with no entry holds nothing on the table. Widening any of this is a
 * deliberate change that shows up in review. Shared by structure.integration.test.ts and setup-tables.integration.test.ts.
 */
export interface TenantGrant {
  readonly unreadable: readonly string[];
  readonly update: readonly string[];
  readonly insertAll: boolean;
  readonly delete: boolean;
  /** Columns left out of the insert grant because the database fills them in. */
  readonly notInserted?: readonly string[];
}

const AGREEMENT: TenantGrant = { unreadable: ["notes", "created_by"], update: [], insertAll: false, delete: false };
const ACCEPTANCE: TenantGrant = { unreadable: ["network_address"], update: [], insertAll: true, delete: false };

export const SETUP_TENANT_GRANTS: Readonly<Record<TenantRoleName, Readonly<Partial<Record<SetupTable, TenantGrant>>>>> = {
  leads_client: {
    agreement: AGREEMENT,
    agreement_acceptance: ACCEPTANCE,
    campaign_host: { unreadable: ["client_org_id"], update: ["job_title", "active"], insertAll: true, delete: false },
    host_hours: { unreadable: ["member_org_kind"], update: [], insertAll: true, delete: true, notInserted: ["member_org_kind"] },
    host_block: { unreadable: ["member_org_kind"], update: [], insertAll: true, delete: true, notInserted: ["member_org_kind"] },
  },
  leads_agency: {
    agreement: AGREEMENT,
    agreement_acceptance: ACCEPTANCE,
    campaign_share: { unreadable: ["agency_org_kind"], update: ["monthly_share", "updated_at"], insertAll: true, delete: true, notInserted: ["agency_org_kind"] },
    campaign_host: { unreadable: ["client_org_id"], update: [], insertAll: false, delete: false },
    host_hours: { unreadable: ["member_org_kind", "created_at"], update: [], insertAll: false, delete: false },
    host_block: { unreadable: ["member_org_kind", "note", "created_at"], update: [], insertAll: false, delete: false },
  },
};
