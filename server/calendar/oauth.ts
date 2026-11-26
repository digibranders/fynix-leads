import { randomBytes } from "node:crypto";
import { z } from "zod";
import { pkcePair, signValue, verifyValue } from "@/server/calendar/crypto";
import type { CalendarProviderName } from "@/server/calendar/provider";

/**
 * The state of one sign-in at Google or Microsoft: a random `state`, the PKCE verifier, the provider and the person who started it, in one cookie signed with the
 * calendar key. The callback accepts a code only when the cookie is ours, is not older than ten minutes, belongs to the signed-in person, and its `state` matches the
 * one in the address. The cookie is not readable by scripts and is only sent to the calendar routes.
 */
export const OAUTH_COOKIE = "calendar_oauth";
export const OAUTH_COOKIE_PATH = "/api/calendar";
const LIFETIME_SECONDS = 600;

const payload = z.object({ state: z.string().min(16), verifier: z.string().min(32), provider: z.enum(["google", "microsoft"]), userId: z.string().min(1), exp: z.number() });
export type OAuthState = z.infer<typeof payload>;

export function newOAuthState(provider: CalendarProviderName, userId: string, now: Date): { readonly state: OAuthState; readonly challenge: string } {
  const { verifier, challenge } = pkcePair();
  return { state: { state: randomBytes(16).toString("base64url"), verifier, provider, userId, exp: Math.floor(now.getTime() / 1000) + LIFETIME_SECONDS }, challenge };
}

/** The `Set-Cookie` value that holds the state. `secure` follows the origin. */
export function stateCookie(state: OAuthState, key: Buffer, secure: boolean): string {
  return `${OAUTH_COOKIE}=${signValue(state, key)}; HttpOnly; SameSite=Lax; Path=${OAUTH_COOKIE_PATH}; Max-Age=${LIFETIME_SECONDS}${secure ? "; Secure" : ""}`;
}

export const clearedStateCookie = (secure: boolean): string => `${OAUTH_COOKIE}=; HttpOnly; SameSite=Lax; Path=${OAUTH_COOKIE_PATH}; Max-Age=0${secure ? "; Secure" : ""}`;

/** The state in a cookie value, or null when it is missing, not ours, malformed or too old. */
export function readStateCookie(value: string | undefined, key: Buffer, now: Date): OAuthState | null {
  if (value === undefined) return null;
  const parsed = payload.safeParse(verifyValue(value, key));
  if (!parsed.success || parsed.data.exp * 1000 < now.getTime()) return null;
  return parsed.data;
}
