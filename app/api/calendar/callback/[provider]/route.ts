import { getSessionContext } from "@/server/auth";
import { calendarSetupFromEnv } from "@/server/calendar";
import { clientMemberId, isProviderName, saveConnection } from "@/server/calendar/connections";
import { OAUTH_COOKIE, clearedStateCookie, readStateCookie } from "@/server/calendar/oauth";
import { getDomain } from "@/server/domain";
import { getEnv } from "@/server/env";

/**
 * Where Google or Microsoft sends the person back. A code is exchanged only when the signed state cookie is ours and fresh, belongs to the signed-in person and the
 * same provider, and its `state` equals the one in the address; the session is checked again here. The person lands on their profile page with a word about how it went.
 */
function back(origin: string, outcome: "connected" | "declined" | "failed", cookie: string): Response {
  return new Response(null, { status: 302, headers: { Location: `${origin}/client/profile?calendar=${outcome}`, "Set-Cookie": cookie, "Cache-Control": "no-store" } });
}

function cookieValue(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }): Promise<Response> {
  const { provider: name } = await context.params;
  const setup = calendarSetupFromEnv();
  const provider = isProviderName(name) ? setup?.providers[name] : undefined;
  if (setup === null || provider === undefined) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const origin = getEnv().APP_ORIGIN;
  const cleared = clearedStateCookie(origin.startsWith("https://"));
  const session = await getSessionContext();
  if (session === null || session.kind !== "client") return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const params = new URL(request.url).searchParams;
  const saved = readStateCookie(cookieValue(request, OAUTH_COOKIE), setup.key, new Date());
  if (saved === null || saved.provider !== provider.name || saved.userId !== session.userId || saved.state !== params.get("state")) return back(origin, "failed", cleared);
  if (params.get("error") !== null) return back(origin, "declined", cleared);
  const code = params.get("code");
  if (code === null || code === "") return back(origin, "failed", cleared);

  try {
    const deps = { authDb: getDomain().authDb, setup };
    const memberId = await clientMemberId(deps.authDb, { userId: session.userId, orgId: session.orgId });
    if (memberId === null) return back(origin, "failed", cleared);
    const tokens = await provider.exchangeCode({ code, verifier: saved.verifier, redirectUri: `${origin}/api/calendar/callback/${provider.name}` });
    await saveConnection(deps, { memberId, provider: provider.name, refreshToken: tokens.refreshToken }, new Date());
    return back(origin, "connected", cleared);
  } catch (error) {
    console.error(`Connecting a calendar failed (${error instanceof Error ? error.name : "unknown error"}).`);
    return back(origin, "failed", cleared);
  }
}
