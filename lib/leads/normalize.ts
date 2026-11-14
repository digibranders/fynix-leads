/**
 * Normalization utilities for prospect deduplication and exclusion checking (spec v2 section 8.1).
 * Pure functions without external or database dependencies.
 */

/** Normalizes a company or website domain name (lowercase, no protocol, no www, no path). */
export function normaliseDomain(raw: string): string {
  let cleaned = raw.trim().toLowerCase();
  cleaned = cleaned.replace(/^https?:\/\//i, "");
  cleaned = cleaned.replace(/^www\./i, "");
  cleaned = cleaned.split("/")[0] ?? "";
  cleaned = cleaned.split("?")[0] ?? "";
  return cleaned.trim();
}

/** Extracts the normalized domain part from an email address. */
export function extractDomainFromEmail(email: string): string {
  const parts = email.trim().toLowerCase().split("@");
  return parts.length > 1 ? (parts[1]?.trim() ?? "") : "";
}

/** Normalizes a LinkedIn profile URL for canonical duplicate matching. */
export function normaliseLinkedinUrl(raw: string): string {
  let cleaned = raw.trim().toLowerCase();
  cleaned = cleaned.replace(/^https?:\/\//i, "");
  cleaned = cleaned.replace(/^www\./i, "");
  cleaned = cleaned.split("?")[0] ?? "";
  cleaned = cleaned.replace(/\/+$/, "");
  return cleaned.trim();
}

/**
 * Checks whether a candidate company, email, or domain matches an exclusion rule.
 */
export function matchesExclusion(
  exclusion: { readonly kind: "domain" | "email" | "company"; readonly value: string },
  prospect: { readonly email: string; readonly domain: string; readonly company: string },
): boolean {
  const normExclusionValue = exclusion.value.trim().toLowerCase();

  if (exclusion.kind === "email") {
    return prospect.email.trim().toLowerCase() === normExclusionValue;
  }

  if (exclusion.kind === "domain") {
    const prospectDomain = normaliseDomain(prospect.domain);
    const emailDomain = extractDomainFromEmail(prospect.email);
    const excludedDomain = normaliseDomain(normExclusionValue);

    return (
      prospectDomain === excludedDomain ||
      prospectDomain.endsWith(`.${excludedDomain}`) ||
      emailDomain === excludedDomain ||
      emailDomain.endsWith(`.${excludedDomain}`)
    );
  }

  if (exclusion.kind === "company") {
    const prospectCompany = prospect.company.trim().toLowerCase();
    return (
      prospectCompany === normExclusionValue ||
      prospectCompany.includes(normExclusionValue) ||
      normExclusionValue.includes(prospectCompany)
    );
  }

  return false;
}
