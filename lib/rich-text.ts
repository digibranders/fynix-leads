import sanitizeHtml from "sanitize-html";
import { htmlToText, isHtmlEmpty, isRichHtml, plainToHtml } from "./rich-text-view";

/**
 * Rich text is stored as a small, cleaned subset of HTML: paragraphs, headings, bold, italic, underline, lists, links and line breaks.
 * Whatever comes in (typed, pasted from Word, or posted by hand) passes through `cleanRich` before it is saved and again before it is shown,
 * so nothing outside that subset reaches a page. Older campaigns hold plain text; `richToHtml` turns that into paragraphs.
 */

const ALLOWED_TAGS = ["p", "br", "h2", "h3", "h4", "strong", "em", "u", "s", "ul", "ol", "li", "a", "blockquote"];

const TABLE_TAGS = ["table", "thead", "tbody", "tr", "td", "th"];

/**
 * What an editor or a Word paste may leave in. Headings above h2 become h2, and links open safely. `tables` keeps table markup too, which only the
 * paste reader (lib/rich-text-paste.ts) asks for, to find a question and answer column; nothing stored ever has a table.
 */
export function cleanRich(html: string, options: { readonly tables?: boolean } = {}): string {
  const cleaned = sanitizeHtml(html, {
    allowedTags: options.tables === true ? [...ALLOWED_TAGS, ...TABLE_TAGS] : ALLOWED_TAGS,
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
    transformTags: {
      h1: "h2",
      b: "strong",
      i: "em",
      a: (tagName, attribs) => ({ tagName, attribs: { ...(attribs.href === undefined ? {} : { href: attribs.href }), target: "_blank", rel: "noopener noreferrer nofollow" } }),
    },
    // A Word paste is full of empty paragraphs and spans; spans are dropped and their text kept.
    disallowedTagsMode: "discard",
  });
  return cleaned
    .replace(/<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Plain text becomes paragraphs; HTML is cleaned. Empty stays empty. This is the form that is saved. */
export function richToHtml(value: string): string {
  if (value.trim() === "") return "";
  return isRichHtml(value) ? cleanRich(value) : plainToHtml(value);
}

export { htmlToText as richToText, isHtmlEmpty as isRichEmpty, isRichHtml };
