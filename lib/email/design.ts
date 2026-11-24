import { escapeHtml, safeHref } from "./escape";

/**
 * The look of every email: the one place that may hold a raw colour, a font or a table. A template says what it means (paragraphs, a button, a signature)
 * and this file turns it into markup, so the account emails and the launch emails stay in step.
 */
const FONT = "font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0c1e2e;";

export function paragraphHtml(text: string): string {
  return `<p style="margin:0 0 16px 0;">${escapeHtml(text)}</p>`;
}

/** A paragraph that keeps its line breaks, for a signature or a privacy line. */
export function linesHtml(lines: readonly string[], muted = false): string {
  return `<p style="margin:0 0 16px 0;${muted ? "color:#5b6b78;font-size:13px;" : ""}">${lines.map(escapeHtml).join("<br>")}</p>`;
}

/** A pill button, and the address spelled out under it for a program that shows no buttons. */
export function buttonHtml(label: string, link: string): string {
  return `<p style="margin:0 0 16px 0;"><a href="${safeHref(link)}" style="display:inline-block;padding:10px 20px;border-radius:999px;background:#0c1e2e;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a></p><p style="margin:0 0 16px 0;word-break:break-all;">${escapeHtml(link)}</p>`;
}

/** The card on the page. `footer` is the muted line at the bottom, or null for none (a prospect letter has none). */
export function shellHtml(inner: string, footer: string | null): string {
  const foot = footer === null ? "" : `<p style="margin:0;color:#5b6b78;">${escapeHtml(footer)}</p>`;
  return `<!doctype html><html lang="en"><body style="margin:0;padding:24px;background:#f4f1ee;${FONT}"><div style="max-width:520px;margin:0 auto;padding:28px;border-radius:22px;background:#ffffff;">${inner}${foot}</div></body></html>`;
}

/** What the stored copy of a message says in place of its link. */
export const LINK_REMOVED_TEXT = "The link is removed from this copy once the message has been sent.";
