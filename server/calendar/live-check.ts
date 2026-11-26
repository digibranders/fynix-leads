import { and, eq, inArray } from "drizzle-orm";
import type { Interval } from "@/lib/calendar/free-time";
import { connectionColumns, type CalendarDeps } from "@/server/calendar/sync";
import { decryptToken } from "@/server/calendar/crypto";
import type { CalendarProviderName } from "@/server/calendar/provider";
import { calendarConnection } from "@/server/db/schema";
import type { Database } from "@/server/db/pool";
import type { TenantActor } from "@/server/domain/alias-identity";
import { DomainError } from "@/server/domain/errors";
import { readTeamTimeForTenant } from "@/server/domain/team-availability";

const MEETING_MINUTES = 30;

/**
 * Asks Google or Microsoft, right now, whether the people about to be invited are busy at the slot (spec 8.5). It runs before the booking transaction opens, so no
 * provider call waits inside one, and only for people the caller may see: the list is cut to the client team of the campaign, so an agency cannot make the portal
 * read a token it has no business with. A provider that does not answer, or a connection that is gone, is skipped: the stored busy time (at most five minutes old)
 * is what the booking is then checked against. Throws `invalid-input` naming nobody when someone turns out busy.
 */
export async function assertLiveFree(db: Database, deps: CalendarDeps | null, actor: TenantActor, input: { readonly campaignId: string; readonly memberIds: readonly string[]; readonly slot: Date }): Promise<void> {
  if (deps === null || input.memberIds.length === 0) return;
  const day = 86_400_000;
  const team = await readTeamTimeForTenant(db, actor, { campaignId: input.campaignId, from: new Date(input.slot.getTime() - day).toISOString(), to: new Date(input.slot.getTime() + day).toISOString() });
  const allowed = input.memberIds.filter((id) => team.some((person) => person.memberId === id));
  if (allowed.length === 0) return;
  const rows = await deps.authDb.select(connectionColumns).from(calendarConnection).where(and(inArray(calendarConnection.memberId, allowed), eq(calendarConnection.status, "connected")));
  const range: Interval = { start: input.slot, end: new Date(input.slot.getTime() + MEETING_MINUTES * 60_000) };
  for (const row of rows) {
    const provider = deps.setup.providers[row.provider as CalendarProviderName];
    if (provider === undefined) continue;
    try {
      const tokens = await provider.refresh(decryptToken(row.refreshTokenEnc, deps.setup.key));
      const events = await provider.listEvents(tokens.accessToken, range, { withTitles: false });
      if (events.some((event) => event.busy && event.start < range.end && event.end > range.start)) {
        throw new DomainError("invalid-input", "One of the people you invited has just become busy then. Pick another time or leave them out.");
      }
    } catch (error) {
      if (error instanceof DomainError) throw error;
      console.error(`A live calendar check was skipped (${error instanceof Error ? error.name : "unknown error"}).`);
    }
  }
}
