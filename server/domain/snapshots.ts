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
  readonly timeZone: string | null;
  /** The supplier a partner agency works under, `null` for everyone else. */
  readonly parentOrgId: string | null;
  readonly status: string;
}

export function snapshotOrganisation(row: OrganisationRow): JsonObject {
  return { ref: row.publicRef, kind: row.kind, name: row.name, brandName: row.brandName, timeZone: row.timeZone, parentOrgId: row.parentOrgId, status: row.status };
}

export interface ProfileRow {
  readonly introduction: string;
  readonly services: string;
  readonly differentiator: string;
  readonly caseStudies: string | null;
}

export function snapshotProfile(row: ProfileRow): JsonObject {
  return { introduction: row.introduction, services: row.services, differentiator: row.differentiator, caseStudies: row.caseStudies };
}

export interface CollateralRow {
  readonly kind: string;
  readonly title: string;
  readonly url: string | null;
}

export function snapshotCollateral(row: CollateralRow): JsonObject {
  return { kind: row.kind, title: row.title, url: row.url };
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
  readonly timeZone: string;
  readonly meetingMinutes: number;
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
    timeZone: row.timeZone,
    meetingMinutes: row.meetingMinutes,
  };
}

export interface InviteRow {
  readonly orgId: string;
  readonly email: string;
  readonly name: string;
  readonly role: string;
  readonly alias: string | null;
  readonly jobTitle?: string | null;
  readonly phone?: string | null;
  readonly expiresAt: Date;
}

/** An invite, without its token or hash. */
export function snapshotInvite(row: InviteRow): JsonObject {
  return { orgId: row.orgId, email: row.email, name: row.name, role: row.role, alias: row.alias, jobTitle: row.jobTitle ?? null, phone: row.phone ?? null, expiresAt: row.expiresAt.toISOString() };
}

export interface MemberRow {
  readonly orgId: string;
  readonly role: string;
  readonly displayName: string;
  readonly jobTitle?: string | null;
  readonly phone?: string | null;
  readonly status: string;
}

export function snapshotMember(row: MemberRow): JsonObject {
  return { orgId: row.orgId, role: row.role, displayName: row.displayName, jobTitle: row.jobTitle ?? null, phone: row.phone ?? null, status: row.status };
}

export interface AgreementRow {
  readonly campaignId: string;
  readonly party: string;
  readonly version: number;
  readonly monthlyTarget: number;
  readonly totalTarget: number;
  readonly disputeWindowHours: number;
  readonly rules: string;
  readonly notes: string;
  readonly status: string;
}

export function snapshotAgreement(row: AgreementRow): JsonObject {
  return {
    campaignId: row.campaignId,
    party: row.party,
    version: row.version,
    monthlyTarget: row.monthlyTarget,
    totalTarget: row.totalTarget,
    disputeWindowHours: row.disputeWindowHours,
    rules: row.rules,
    notes: row.notes,
    status: row.status,
  };
}

export interface AcceptanceRow {
  readonly agreementId: string;
  readonly userId: string;
  readonly networkAddress: string;
}

export function snapshotAcceptance(row: AcceptanceRow): JsonObject {
  return { agreementId: row.agreementId, userId: row.userId, networkAddress: row.networkAddress };
}

export interface ShareRow {
  readonly campaignId: string;
  readonly agencyOrgId: string;
  readonly monthlyShare: number;
}

export function snapshotShare(row: ShareRow): JsonObject {
  return { campaignId: row.campaignId, agencyOrgId: row.agencyOrgId, monthlyShare: row.monthlyShare };
}

export interface HostRow {
  readonly campaignId: string;
  readonly memberId: string;
  readonly jobTitle: string;
  readonly active: boolean;
}

export function snapshotHost(row: HostRow): JsonObject {
  return { campaignId: row.campaignId, memberId: row.memberId, jobTitle: row.jobTitle, active: row.active };
}

/** A host's whole weekly set: the time zone (`null` when there is none) and the windows, as stored. */
export function snapshotHours(timeZone: string | null, windows: readonly { readonly weekday: number; readonly startMinute: number; readonly endMinute: number }[]): JsonObject {
  return { timeZone, windows: windows.map((slot) => ({ weekday: slot.weekday, startMinute: slot.startMinute, endMinute: slot.endMinute })) };
}

export interface BlockRow {
  readonly memberId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly note: string;
}

export function snapshotBlock(row: BlockRow): JsonObject {
  return { memberId: row.memberId, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), note: row.note };
}
