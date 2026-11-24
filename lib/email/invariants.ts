import { isProspectTemplate } from "./launch-templates";
import { LINK_REMOVED_TEXT, linkRuleFor, renderEmail, type EmailContent } from "./templates";

/** What the rules about a message are checked against: the link a portal email carries, and, for a prospect letter, who and what it must never name. */
export interface InvariantContext {
  /** The link a portal email carries when it is sent. Any web address does; it is only searched for. */
  readonly portalLink: string;
  /** The only web addresses a prospect letter may hold: the meeting link and the client's own privacy page. */
  readonly allowedProspectUrls: readonly string[];
  /** Patterns a prospect letter must never match: Fynix, the coordinator, an agency, the portal and its paths. */
  readonly forbiddenInProspect: readonly RegExp[];
}

export interface InvariantResult {
  readonly ok: boolean;
  /** One plain sentence per rule that failed. Empty when `ok`. */
  readonly problems: readonly string[];
}

const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
const DOCTYPE = "<!doctype html>";

/**
 * The rules every message holds to, in one place so the test and the templates screen cannot drift apart:
 * 1. no em or en dash and no exclamation mark, with and without the link (the stored copy has none);
 * 2. the link rule of its template: a message that acts through a link carries it when sent (text and button) and says in the stored copy that it is not kept, while a
 *    message with no link never carries one;
 * 3. a prospect letter never matches a forbidden pattern and holds no web address but the allowed ones.
 */
export function checkEmailInvariants(content: EmailContent, context: InvariantContext): InvariantResult {
  const problems: string[] = [];
  const sent = renderEmail(content, context.portalLink);
  const stored = renderEmail(content, null);
  const everything = (mail: { readonly subject: string; readonly text: string; readonly html: string }): string => `${mail.subject}\n${mail.text}\n${mail.html}`;

  for (const [name, mail] of [["sent", sent], ["stored", stored]] as const) {
    const all = everything(mail);
    if (DASHES.test(all)) problems.push(`The ${name} copy has an em or en dash.`);
    if (all.replace(DOCTYPE, "").includes("!")) problems.push(`The ${name} copy has an exclamation mark.`);
  }

  if (linkRuleFor(content.template) === "required") {
    if (!sent.text.includes(context.portalLink) || !sent.html.includes(`href="${context.portalLink}"`)) problems.push("The sent copy does not carry its link as text and as a button.");
    if (!stored.text.includes(LINK_REMOVED_TEXT) || !stored.html.includes(LINK_REMOVED_TEXT)) problems.push("The stored copy does not say the link is not kept.");
    if (everything(stored).includes(context.portalLink)) problems.push("The stored copy still holds the link.");
  } else if (everything(sent).includes(context.portalLink)) {
    problems.push("This message must carry no link to the portal, and does.");
  }

  if (isProspectTemplate(content.template)) {
    for (const mail of [sent, stored]) {
      const all = everything(mail);
      for (const pattern of context.forbiddenInProspect) if (pattern.test(all)) problems.push(`The letter matches the forbidden pattern ${String(pattern)}.`);
      const urls = new Set((all.match(/https?:\/\/[^\s"<]+/g) ?? []).map((url) => url.replace(/&amp;/g, "&")));
      for (const url of urls) if (!context.allowedProspectUrls.includes(url)) problems.push("The letter holds a web address that is not the meeting link or the privacy page.");
    }
  }

  const unique = [...new Set(problems)];
  return { ok: unique.length === 0, problems: unique };
}
