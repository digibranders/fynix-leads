/** The text of a form field, trimmed; empty when the field is missing or is a file. */
export function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** The proposed times of the lead form, as the ISO instants the browser posted, without the empty slots. */
export function formTimes(formData: FormData): string[] {
  return formData.getAll("proposedTimes").filter((time): time is string => typeof time === "string" && time.length > 0);
}

/**
 * The fields of the lead form as a draft holds them: an empty alias or host is `null` (the schema reads a uuid or nothing), the optional text is left
 * out when empty, and the campaign is named only for a new draft (an edit never moves a draft to another campaign).
 */
export function draftInput(formData: FormData, target: { readonly campaignId: string } | { readonly leadId: string }) {
  return {
    ...target,
    aliasIdentityId: formText(formData, "aliasIdentityId") || null,
    hostMemberId: formText(formData, "hostMemberId") || null,
    prospectName: formText(formData, "prospectName"),
    prospectTitle: formText(formData, "prospectTitle"),
    prospectCompany: formText(formData, "prospectCompany"),
    prospectDomain: formText(formData, "prospectDomain"),
    prospectLinkedinUrl: formText(formData, "prospectLinkedinUrl"),
    prospectEmail: formText(formData, "prospectEmail"),
    prospectPhone: formText(formData, "prospectPhone") || undefined,
    prospectNotes: formText(formData, "prospectNotes") || undefined,
    bantBudget: formText(formData, "bantBudget"),
    bantAuthority: formText(formData, "bantAuthority"),
    bantNeed: formText(formData, "bantNeed"),
    bantTimeline: formText(formData, "bantTimeline"),
    proposedTimes: formTimes(formData),
  };
}
