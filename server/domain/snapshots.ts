import type { JsonObject } from "@/server/domain/audit";

/**
 * The state of a record as the audit log keeps it, built field by field. The audit log is read by Fynix only, but it is kept
 * forever, so it holds what a person needs to see what changed and nothing that could be used: never a token hash, a link, a
 * password or a session. Each function names its fields on purpose; a new column is not in the log until someone adds it here.
 */
export interface OrganisationRow {
  readonly publicRef: string;
  readonly kind: string;
  readonly name: string;
  readonly brandName: string | null;
  readonly status: string;
}

export function snapshotOrganisation(row: OrganisationRow): JsonObject {
  return { ref: row.publicRef, kind: row.kind, name: row.name, brandName: row.brandName, status: row.status };
}

export interface CampaignRow {
  readonly publicRef: string;
  readonly name: string;
  readonly clientOrgId: string;
  readonly agencyOrgId: string;
  readonly status: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly monthlyTarget: number;
  readonly totalTarget: number;
  readonly geography: string;
  readonly industries: readonly string[];
  readonly companySize: string;
  readonly icp: string;
  readonly jobTitles: readonly string[];
  readonly seniority: string;
  readonly technologies: readonly string[];
  readonly bantBudget: string;
  readonly bantAuthority: string;
  readonly bantNeed: string;
  readonly bantTimeline: string;
  readonly instructions: string;
  readonly internalNotes: string | null;
}

export function snapshotCampaign(row: CampaignRow): JsonObject {
  return {
    ref: row.publicRef,
    name: row.name,
    clientOrgId: row.clientOrgId,
    agencyOrgId: row.agencyOrgId,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    monthlyTarget: row.monthlyTarget,
    totalTarget: row.totalTarget,
    geography: row.geography,
    industries: [...row.industries],
    companySize: row.companySize,
    icp: row.icp,
    jobTitles: [...row.jobTitles],
    seniority: row.seniority,
    technologies: [...row.technologies],
    bantBudget: row.bantBudget,
    bantAuthority: row.bantAuthority,
    bantNeed: row.bantNeed,
    bantTimeline: row.bantTimeline,
    instructions: row.instructions,
    internalNotes: row.internalNotes,
  };
}

export interface InviteRow {
  readonly orgId: string;
  readonly email: string;
  readonly name: string;
  readonly role: string;
  readonly alias: string | null;
  readonly expiresAt: Date;
}

/** An invite, without its token or hash. */
export function snapshotInvite(row: InviteRow): JsonObject {
  return { orgId: row.orgId, email: row.email, name: row.name, role: row.role, alias: row.alias, expiresAt: row.expiresAt.toISOString() };
}

export interface MemberRow {
  readonly orgId: string;
  readonly role: string;
  readonly displayName: string;
  readonly status: string;
}

export function snapshotMember(row: MemberRow): JsonObject {
  return { orgId: row.orgId, role: row.role, displayName: row.displayName, status: row.status };
}
