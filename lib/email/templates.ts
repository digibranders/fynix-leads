import { buttonHtml, LINK_REMOVED_TEXT, paragraphHtml, shellHtml } from "./design";
import { isLaunchTemplate, isProspectTemplate, LAUNCH_TEMPLATES, parseLaunchContent, renderLaunchEmail, type LaunchContent } from "./launch-templates";

export { LINK_REMOVED_TEXT };

/**
 * The messages the app sends. A template is a pure function from content to text and HTML: it escapes every value it
 * interpolates and never reads the network or the database. Plain templates, not React Email: two messages do not
 * justify a rendering dependency; phase 4 revisits that when the notification emails arrive.
 *
 * The link is passed separately from the content. The outbox stores the content (without the link) and the link in its
 * own column that is cleared once the message is sent, so `renderEmail(content, null)` is the copy that stays in the
 * table: it says the link is not kept.
 */
export const EMAIL_TEMPLATES = ["password_reset", "invite", "alias_code", ...LAUNCH_TEMPLATES] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

export interface PasswordResetParams {
  readonly expiresInMinutes: number;
}
export interface InviteParams {
  /** The invited person's name, as Fynix typed it. */
  readonly name: string;
  /** The organisation they are joining: their own, never the other party's. */
  readonly organisationName: string;
  /** The last day the link works, already formatted: "8 December 2026". */
  readonly expiresOn: string;
}

export interface AliasCodeParams {
  /** The display name of the alias being verified. */
  readonly displayName: string;
  /** The 6-digit code, sent only to the alias mailbox: entering it proves the person controls that mailbox. */
  readonly code: string;
}

export type EmailContent =
  | { readonly template: "password_reset"; readonly params: PasswordResetParams }
  | { readonly template: "invite"; readonly params: InviteParams }
  | { readonly template: "alias_code"; readonly params: AliasCodeParams }
  | LaunchContent;

/**
 * Whether a template carries a link. The account emails that act through a link (password reset, invite) and the emails to people of the portal need one (the
 * outbox refuses to send them without a link on the application's origin). A prospect letter has none: it carries a Meet link in its body instead, checked when
 * the content is read back. The alias code has none either: it is a code to type, queued without a link by `app_queue_alias_code_mail`.
 */
export type LinkRule = "required" | "none";
export const linkRuleFor = (template: EmailTemplate): LinkRule => (isProspectTemplate(template) || template === "alias_code" ? "none" : "required");

export interface RenderedEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}


interface Layout {
  readonly subject: string;
  readonly paragraphs: readonly string[];
  /** The text that introduces the link, and the label of the button. */
  readonly linkIntro: string;
  readonly linkLabel: string;
  readonly closing: string;
}

function layoutFor(content: Extract<EmailContent, { readonly template: "password_reset" | "invite" | "alias_code" }>): Layout {
  if (content.template === "password_reset") {
    return {
      subject: "Reset your Fynix Leads password",
      paragraphs: ["Someone asked to reset the password for this email address on Fynix Leads."],
      linkIntro: `To choose a new password, open this link within ${content.params.expiresInMinutes} minutes:`,
      linkLabel: "Choose a new password",
      closing: "If you did not ask for this, ignore this email. Your password stays the same.",
    };
  }
  if (content.template === "alias_code") {
    return {
      subject: "Your Fynix Leads verification code",
      paragraphs: [`Your verification code for ${content.params.displayName} is ${content.params.code}.`, "Enter it on the aliases page to start using this identity."],
      linkIntro: "",
      linkLabel: "",
      closing: "If you did not ask for this, ignore this email. Nothing changes until the code is entered.",
    };
  }
  return {
    subject: "You are invited to Fynix Leads",
    paragraphs: [`Hello ${content.params.name},`, `Fynix has invited you to join ${content.params.organisationName} on Fynix Leads.`],
    linkIntro: `To set your password and get started, open this link by ${content.params.expiresOn}:`,
    linkLabel: "Set your password",
    closing: "If you were not expecting this invitation, ignore this email. Nothing happens until the link is used.",
  };
}

function renderHtml(layout: Layout, link: string | null): string {
  const action =
    layout.linkIntro === ""
      ? ""
      : link === null
      ? `${paragraphHtml(layout.linkIntro)}${paragraphHtml(LINK_REMOVED_TEXT)}`
      : `${paragraphHtml(layout.linkIntro)}${buttonHtml(layout.linkLabel, link)}`;
  return shellHtml(`${layout.paragraphs.map(paragraphHtml).join("")}${action}${paragraphHtml(layout.closing)}`, "Fynix Digital");
}

const isLaunchContent = (content: EmailContent): content is LaunchContent => isLaunchTemplate(content.template);

/** The subject, plain text and HTML of a message. With `link` null the text and HTML say the link is not kept. */
export function renderEmail(content: EmailContent, link: string | null): RenderedEmail {
  if (isLaunchContent(content)) return renderLaunchEmail(content, link);
  const layout = layoutFor(content);
  const text = (layout.linkIntro === "" ? [...layout.paragraphs, "", layout.closing] : [...layout.paragraphs, "", layout.linkIntro, link ?? LINK_REMOVED_TEXT, "", layout.closing]).join("\n");
  return { subject: layout.subject, text, html: renderHtml(layout, link) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads the `template` and `params` columns back into typed content, or throws. Anything else in the table is not trusted to be well formed. */
export function parseEmailContent(template: string, params: unknown): EmailContent {
  if (!isRecord(params)) throw new Error("An email's params must be an object.");
  if (isLaunchTemplate(template)) return parseLaunchContent(template, params);
  if (template === "password_reset") {
    const minutes = params.expiresInMinutes;
    if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 1) throw new Error("password_reset needs a whole number of minutes.");
    return { template, params: { expiresInMinutes: minutes } };
  }
  if (template === "invite") {
    const { name, organisationName, expiresOn } = params;
    if (typeof name !== "string" || typeof organisationName !== "string" || typeof expiresOn !== "string") {
      throw new Error("invite needs a name, an organisation name and an expiry date.");
    }
    return { template, params: { name, organisationName, expiresOn } };
  }
  if (template === "alias_code") {
    const { displayName, code } = params;
    if (typeof displayName !== "string" || typeof code !== "string" || !/^[0-9]{6}$/.test(code)) throw new Error("alias_code needs a display name and a 6-digit code.");
    return { template, params: { displayName, code } };
  }
  throw new Error(`There is no email template named ${template}.`);
}

/** "8 December 2026", in UTC, for the invite's last day. */
export function formatEmailDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
