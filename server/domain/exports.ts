/**
 * Zero-leakage CSV export service conforming strictly to RFC 4180.
 * Enforces role-based data projection and strict PII isolation.
 */

export interface ClientLeadRow {
  readonly id?: string;
  readonly publicRef: string;
  readonly campaignId?: string;
  readonly prospectName: string;
  readonly prospectTitle: string;
  readonly prospectCompany: string;
  readonly prospectDomain: string;
  readonly prospectLinkedinUrl?: string | null;
  readonly prospectEmail: string;
  readonly prospectPhone?: string | null;
  readonly prospectNotes?: string | null;
  readonly bantBudget: string;
  readonly bantAuthority: string;
  readonly bantNeed: string;
  readonly bantTimeline: string;
  readonly stage: string;
  readonly scheduledMeetingTime?: Date | string | null;
  readonly submittedAt: Date | string;
  readonly sourceOrgId?: unknown;
  readonly submittedByUserId?: unknown;
  readonly aliasIdentityId?: unknown;
  readonly agencyName?: unknown;
  readonly supplierName?: unknown;
}

export interface AgencyLeadRow {
  readonly id?: string;
  readonly publicRef: string;
  readonly campaignId?: string;
  readonly campaignName?: string;
  readonly prospectName: string;
  readonly prospectTitle: string;
  readonly prospectCompany: string;
  readonly prospectDomain: string;
  readonly prospectLinkedinUrl?: string | null;
  readonly prospectEmail: string;
  readonly prospectPhone?: string | null;
  readonly stage: string;
  readonly overShare?: boolean;
  readonly duplicateOverride?: boolean;
  readonly scheduledMeetingTime?: Date | string | null;
  readonly submittedAt: Date | string;
  readonly clientEmail?: unknown;
  readonly clientPhone?: unknown;
  readonly hostEmail?: unknown;
  readonly hostPhone?: unknown;
  readonly clientContactEmail?: unknown;
  readonly clientContactPhone?: unknown;
}

export interface FynixLeadRow {
  readonly id?: string;
  readonly publicRef: string;
  readonly campaignId?: string;
  readonly campaignName?: string;
  readonly clientBrandName?: string;
  readonly prospectName: string;
  readonly prospectTitle: string;
  readonly prospectCompany: string;
  readonly prospectDomain: string;
  readonly prospectEmail: string;
  readonly prospectPhone?: string | null;
  readonly stage: string;
  readonly overShare?: boolean;
  readonly duplicateOverride?: boolean;
  readonly scheduledMeetingTime?: Date | string | null;
  readonly submittedAt: Date | string;
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Serializes headers and tabular rows into an RFC 4180 compliant CSV string.
 * Escapes fields containing commas, double-quotes, or CRLF line endings.
 */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | boolean | null | undefined)[])[],
): string {
  const formatField = (value: string | number | boolean | null | undefined): string => {
    if (value === null || value === undefined) {
      return "";
    }
    const str = String(value);
    if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
      return `"${str.replaceAll('"', '""')}"`;
    }
    return str;
  };

  const headerLine = headers.map(formatField).join(",");
  const dataLines = rows.map((row) => row.map(formatField).join(","));
  return [headerLine, ...dataLines].join("\r\n") + "\r\n";
}

/**
 * Generates an RFC 4180 CSV export for client portal users.
 * Strict privacy guarantee: never includes agency name, supplier name,
 * sourceOrgId, submittedByUserId, or aliasIdentityId.
 */
export function generateClientLeadsCsv(leads: readonly ClientLeadRow[]): string {
  const headers = [
    "Reference",
    "Prospect Name",
    "Title",
    "Company",
    "Domain",
    "LinkedIn",
    "Email",
    "Phone",
    "Notes",
    "Budget",
    "Authority",
    "Need",
    "Timeline",
    "Stage",
    "Meeting Time",
    "Submitted At",
  ];

  const rows = leads.map((l) => [
    l.publicRef,
    l.prospectName,
    l.prospectTitle,
    l.prospectCompany,
    l.prospectDomain,
    l.prospectLinkedinUrl ?? "",
    l.prospectEmail,
    l.prospectPhone ?? "",
    l.prospectNotes ?? "",
    l.bantBudget,
    l.bantAuthority,
    l.bantNeed,
    l.bantTimeline,
    l.stage,
    formatDate(l.scheduledMeetingTime),
    formatDate(l.submittedAt),
  ]);

  return toCsv(headers, rows);
}

/**
 * Generates an RFC 4180 CSV export for agency and supplier portal users.
 * Strict privacy guarantee: never includes client contact direct phone number or direct email.
 */
export function generateAgencyLeadsCsv(leads: readonly AgencyLeadRow[]): string {
  const headers = [
    "Reference",
    "Prospect Name",
    "Title",
    "Company",
    "Domain",
    "LinkedIn",
    "Stage",
    "Over Share",
    "Duplicate Override",
    "Meeting Time",
    "Submitted At",
  ];

  const rows = leads.map((l) => [
    l.publicRef,
    l.prospectName,
    l.prospectTitle,
    l.prospectCompany,
    l.prospectDomain,
    l.prospectLinkedinUrl ?? "",
    l.stage,
    Boolean(l.overShare),
    Boolean(l.duplicateOverride),
    formatDate(l.scheduledMeetingTime),
    formatDate(l.submittedAt),
  ]);

  return toCsv(headers, rows);
}

/**
 * Generates an RFC 4180 CSV export for Fynix operations with full campaign overview.
 */
export function generateFynixLeadsCsv(leads: readonly FynixLeadRow[]): string {
  const headers = [
    "Reference",
    "Campaign",
    "Client Brand",
    "Prospect Name",
    "Title",
    "Company",
    "Domain",
    "Email",
    "Phone",
    "Stage",
    "Over Share",
    "Duplicate Override",
    "Meeting Time",
    "Submitted At",
  ];

  const rows = leads.map((l) => [
    l.publicRef,
    l.campaignName ?? "",
    l.clientBrandName ?? "",
    l.prospectName,
    l.prospectTitle,
    l.prospectCompany,
    l.prospectDomain,
    l.prospectEmail,
    l.prospectPhone ?? "",
    l.stage,
    Boolean(l.overShare),
    Boolean(l.duplicateOverride),
    formatDate(l.scheduledMeetingTime),
    formatDate(l.submittedAt),
  ]);

  return toCsv(headers, rows);
}
