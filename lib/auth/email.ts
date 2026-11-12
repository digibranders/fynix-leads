/** The one spelling of an email address the app stores and compares: trimmed and lower case. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
