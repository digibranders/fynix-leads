import { unexplainedChecks, type QualificationCheck } from "@/lib/qualification-checks";

/** The text fields a lead cannot be sent without, by the names the form posts. */
export const REQUIRED_TEXT_FIELDS = ["prospectName", "prospectTitle", "prospectCompany", "prospectDomain", "prospectEmail", "prospectLinkedinUrl"] as const;
export type RequiredTextField = (typeof REQUIRED_TEXT_FIELDS)[number];
export type RequiredTexts = Readonly<Record<RequiredTextField, string>>;

/** The meeting the form has so far: the chosen time, and how many client people are ticked to invite. */
export interface ChosenSlot {
  readonly time: string;
  readonly invitees: number;
}

export const NO_SLOT: ChosenSlot = { time: "", invitees: 0 };

const PLAUSIBLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The required text of a form, read from what its fields hold now. */
export function requiredTexts(form: { readonly elements: ArrayLike<unknown> } | null): RequiredTexts {
  const values: Record<string, string> = Object.fromEntries(REQUIRED_TEXT_FIELDS.map((name) => [name, ""]));
  for (const element of Array.from(form?.elements ?? [])) {
    const field = element as { name?: string; value?: string };
    if (typeof field.name === "string" && field.name in values && typeof field.value === "string") values[field.name] = field.value;
  }
  return values as RequiredTexts;
}

const FIELD_LABEL: Readonly<Record<RequiredTextField, string>> = {
  prospectName: "Full name",
  prospectTitle: "Job title",
  prospectCompany: "Company name",
  prospectDomain: "Company domain",
  prospectEmail: "Work email",
  prospectLinkedinUrl: "LinkedIn profile URL",
};

const shorten = (text: string, max = 48): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}...` : text);

/** What stands between the lead and the send button, in the words of the form, in the order of the form. Empty when it can be sent. */
export function leadMissing(input: { readonly campaignId: string; readonly texts: RequiredTexts; readonly slot: ChosenSlot; readonly checks: readonly QualificationCheck[] }): string[] {
  const missing: string[] = [];
  if (input.campaignId === "") missing.push("Campaign");
  for (const name of REQUIRED_TEXT_FIELDS) if (input.texts[name].trim() === "") missing.push(FIELD_LABEL[name]);
  const email = input.texts.prospectEmail.trim();
  if (email !== "" && !PLAUSIBLE_EMAIL.test(email)) missing.push("A valid work email");
  const questions = input.checks.filter((check) => check.kind === "question");
  for (const check of unexplainedChecks(input.checks)) {
    missing.push(check.kind === "question" ? `Answer to question ${questions.indexOf(check) + 1}` : `Reason: ${shorten(check.label)}`);
  }
  if (input.slot.time === "") missing.push("A meeting time");
  else if (input.slot.invitees === 0) missing.push("Someone to invite");
  return missing;
}

/**
 * Whether a lead can be sent: a campaign, every required field, a meeting time with someone to invite, and words beside every check that needs them. It is the form's
 * own check, so the send button stays off until the send can work. The server checks the same things again (`submitLeadSchema`), and a test holds the two together.
 */
export function leadIsReady(input: { readonly campaignId: string; readonly texts: RequiredTexts; readonly slot: ChosenSlot; readonly checks: readonly QualificationCheck[] }): boolean {
  return leadMissing(input).length === 0;
}
