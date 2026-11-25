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
  readonly coordinatorName?: unknown;
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
  readonly clientName?: string;
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
    // A cell that starts with = + - @ (or a tab or return) is read as a formula by Excel and Sheets: the apostrophe makes it text.
    const raw = String(value);
    const str = typeof value === "string" && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
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
 * Strict privacy guarantee: never includes agency name, coordinator name,
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
 * Generates an RFC 4180 CSV export for agency and coordinator portal users.
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
    "Client",
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
    l.clientName ?? "",
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

export interface MeetingExportRow {
  readonly publicRef: string;
  readonly leadRef: string;
  readonly prospectName: string;
  readonly prospectCompany: string;
  readonly campaignName: string;
  /** Only Fynix's export carries the client. */
  readonly clientName?: string;
  readonly scheduledStartTime: Date | string;
  readonly durationMinutes: number;
  readonly outcome: string;
  /** A side (client, agency, coordinator, fynix), never a person. */
  readonly recordedByRole?: string | null;
  readonly contestedByRole?: string | null;
}

/**
 * An RFC 4180 CSV of meetings. It carries a prospect's name and company and a side for who recorded and who contested, and never a person from the other
 * side, an email or a phone: the three portals share this shape and differ in the rows their reads return. Fynix's export adds the client's name.
 */
export function generateMeetingsCsv(meetings: readonly MeetingExportRow[], options: { readonly withClient?: boolean } = {}): string {
  const withClient = options.withClient === true;
  const headers = ["Meeting", "Lead", "Prospect", "Company", "Campaign", ...(withClient ? ["Client"] : []), "Start", "Minutes", "Outcome", "Recorded by", "Contested by"];
  const rows = meetings.map((m) => [
    m.publicRef,
    m.leadRef,
    m.prospectName,
    m.prospectCompany,
    m.campaignName,
    ...(withClient ? [m.clientName ?? ""] : []),
    formatDate(m.scheduledStartTime),
    m.durationMinutes,
    m.outcome,
    m.recordedByRole ?? "",
    m.contestedByRole ?? "",
  ]);
  return toCsv(headers, rows);
}
