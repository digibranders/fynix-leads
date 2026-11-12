import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasSessionCookie } from "@/lib/auth/session-cookie";
import { getSessionContext } from "@/server/auth";
import type { SessionContext } from "@/server/auth/session-context";

/**
 * For a page or layout that needs a signed-in user: returns who they are, or sends them to the sign-in page. A request
 * that carried a session cookie which no longer resolves (expired, signed out elsewhere, membership suspended) is told so
 * (`?reason=ended`); a request with no cookie is just asked to sign in. Call it inside a `<Suspense>` boundary, because
 * with Cache Components a session read is request-time data.
 */
export async function requireSessionContext(): Promise<SessionContext> {
  const context = await getSessionContext();
  if (context !== null) return context;
  redirect(hasSessionCookie(await cookies()) ? "/sign-in?reason=ended" : "/sign-in");
}
