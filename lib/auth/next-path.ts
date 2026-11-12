const MAX_LENGTH = 200;
/** The pages that sign a person in or out of a loop: sending someone back to one of them after signing in would go round again. */
const AUTH_PATHS: ReadonlySet<string> = new Set(["/sign-in", "/forgot-password", "/reset-password"]);
/** An origin that cannot be real, used only to ask the URL parser where a path really points. */
const PLACEHOLDER_ORIGIN = "http://placeholder.invalid";

function hasControlOrBackslash(value: string): boolean {
  return [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === "\\");
}

/**
 * The page to send a person to after they sign in, taken from a `next` field, or `null` when it is not safe. Only a path
 * on this site passes: it must start with one slash, and `//host`, `/\host`, a scheme, a backslash or a control character
 * (browsers read several of them as another site) are refused, as is anything long or pointing at an auth page. The caller
 * falls back to the default landing page when this returns `null`.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LENGTH) return null;
  if (!value.startsWith("/") || value.startsWith("//") || hasControlOrBackslash(value)) return null;
  const path = value.split(/[?#]/)[0] ?? "";
  if (AUTH_PATHS.has(path)) return null;
  try {
    if (new URL(value, PLACEHOLDER_ORIGIN).origin !== PLACEHOLDER_ORIGIN) return null;
  } catch {
    return null;
  }
  return value;
}
