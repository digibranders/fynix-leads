/**
 * The names the session cookie can have: with a `__Secure-` prefix on https, without on http (Better Auth chooses from the
 * origin). A request that carries one but resolves to no session has an ended session, which is worth saying to the person;
 * a request that carries none is just not signed in. server/auth/create-auth.integration.test.ts checks these against the
 * name Better Auth really sets.
 */
export const SESSION_COOKIE_NAMES: readonly string[] = ["fynix-leads.session_token", "__Secure-fynix-leads.session_token"];

export function hasSessionCookie(cookies: { has(name: string): boolean }): boolean {
  return SESSION_COOKIE_NAMES.some((name) => cookies.has(name));
}
