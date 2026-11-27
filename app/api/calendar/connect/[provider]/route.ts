import { getSessionContext } from "@/server/auth";
import { calendarSetupFromEnv } from "@/server/calendar";
import { isProviderName } from "@/server/calendar/connections";
import { newOAuthState, stateCookie } from "@/server/calendar/oauth";
import { getEnv } from "@/server/env";

/**
 * Starts connecting a calendar: only a signed-in person (of a client, an agency or Fynix), only while calendar connection is on and the provider is set up. Sends the person to Google or
 * Microsoft with a signed state and a PKCE challenge. Anything else gets the same plain 404.
 */
function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(_request: Request, context: { params: Promise<{ provider: string }> }): Promise<Response> {
  const { provider: name } = await context.params;
  const setup = calendarSetupFromEnv();
  const provider = isProviderName(name) ? setup?.providers[name] : undefined;
  if (setup === null || provider === undefined) return notFound();
  const session = await getSessionContext();
  if (session === null) return notFound();
  const origin = getEnv().APP_ORIGIN;
  const { state, challenge } = newOAuthState(provider.name, session.userId, new Date());
  const url = provider.authorizationUrl({ state: state.state, challenge, redirectUri: `${origin}/api/calendar/callback/${provider.name}` });
  return new Response(null, { status: 302, headers: { Location: url, "Set-Cookie": stateCookie(state, setup.key, origin.startsWith("https://")), "Cache-Control": "no-store" } });
}
