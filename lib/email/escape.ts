const HTML_ENTITIES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapes text for an HTML body or an attribute value. Every value a template interpolates goes through this. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character] ?? character);
}

/** A link for an `href`: escaped, and only ever http or https, so a value that is not a web address cannot become a script link. */
export function safeHref(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("An email link must be a full web address.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("An email link must start with http or https.");
  return escapeHtml(parsed.toString());
}
