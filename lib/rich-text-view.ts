/**
 * The parts of rich text that need no HTML cleaner, so a client component can use them without pulling sanitize-html into the browser bundle.
 * The cleaner itself, and the rules for what may be stored, are in lib/rich-text.ts.
 */

const HTML_START = /^\s*<(p|h[1-6]|ul|ol|blockquote)[\s>]/i;

/** True when the stored value is HTML from the editor, false when it is plain text from before. */
export const isRichHtml = (value: string): boolean => HTML_START.test(value);

const escapeText = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Plain text as paragraphs: a blank line ends one, a single line break stays a break. Markup in it is shown as text. */
export function plainToHtml(value: string): string {
  if (value.trim() === "") return "";
  return value
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeText(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** What to put on a page for a stored value. Stored HTML was cleaned when it was saved; older plain text is turned into paragraphs. */
export const viewHtml = (value: string): string => (isRichHtml(value) ? value : plainToHtml(value));

/** The text of a rich value with no markup, one line per block. For summaries, previews and "is it empty". */
export function htmlToText(value: string): string {
  if (!isRichHtml(value)) return value.trim();
  return value
    .replace(/<\/(p|h[1-6]|li|blockquote)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** True when there is nothing a person would read: no text, only empty markup. */
export const isHtmlEmpty = (value: string): boolean => htmlToText(value) === "";
