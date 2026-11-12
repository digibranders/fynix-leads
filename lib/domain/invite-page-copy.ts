import type { OrganisationKind } from "@/lib/auth/session-lifetime";

/** The fixed words of the accept-invite page that are not messages from a flow. The flow messages live in `invite-messages.ts`. */
export const INVITE_LEDE = "Choose a password and accept the terms to finish creating your account.";
export const INVITE_UNAVAILABLE_TITLE = "Invite not available";
export const INVITE_EMAIL_LABEL = "Email";
export const INVITE_ACCOUNT_LABEL = "Account";
export const INVITE_ACCEPT_LABEL = "I accept these terms";
export const INVITE_SUBMIT_LABEL = "Create account";
export const INVITE_SUBMIT_PENDING_LABEL = "Creating account";

/** The greeting uses the name exactly as Fynix typed it. */
export function welcomeHeading(name: string): string {
  return `Welcome, ${name}`;
}

/** The one word for the party on the page. */
export const PARTY_LABEL: Readonly<Record<OrganisationKind, string>> = { client: "Client", agency: "Agency", fynix: "Fynix" };

/** The text of a terms document as paragraphs: every line break, blank or not, ends a paragraph. Never HTML. */
export function termsParagraphs(body: string): string[] {
  return body.split(/\r?\n/).filter((line) => line.trim().length > 0);
}
