import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { mergeIntervals, type Interval } from "@/lib/calendar/free-time";
import type { CalendarSetup } from "@/server/calendar";
import { decryptToken, encryptToken } from "@/server/calendar/crypto";
import { CalendarAuthError, type CalendarEvent, type CalendarProvider, type CalendarProviderName } from "@/server/calendar/provider";
import type { Database } from "@/server/db/pool";
import { calendarConnection, member, memberBusy } from "@/server/db/schema";

/** How far ahead busy time is kept. */
export const SYNC_DAYS = 60;
/** A connection that keeps failing for another reason than a refusal is called broken after this many syncs in a row (spec 8.7). */
export const BROKEN_AFTER_FAILURES = 3;
/** A portal meeting that comes back from the person's own calendar carries this id suffix and is dropped, so they see it once (spec 8.6). */
export const PORTAL_UID_SUFFIX = "@leads.invalid";

type ConnectionRow = typeof calendarConnection.$inferSelect;
/** Every column, named. The auth pool reads whole connections, and a read with no column list is refused by the boundary test. */
export const connectionColumns = getTableColumns(calendarConnection);

export interface CalendarDeps {
  readonly authDb: Database;
  readonly setup: CalendarSetup;
}

/** Only the error's name is logged, never its message, which could carry a response. */
const logFault = (what: string, error: unknown): void => console.error(`${what} (${error instanceof Error ? error.name : "unknown error"}).`);

/** The refresh token in use now. A provider that issues a new one with every refresh (Microsoft) has it stored at once, before anything else can fail. */
async function accessTokenFor(deps: CalendarDeps, provider: CalendarProvider, row: ConnectionRow, now: Date): Promise<string> {
  const refreshToken = decryptToken(row.refreshTokenEnc, deps.setup.key);
  const tokens = await provider.refresh(refreshToken);
  if (tokens.refreshToken !== null && tokens.refreshToken !== refreshToken) {
    await deps.authDb.update(calendarConnection).set({ refreshTokenEnc: encryptToken(tokens.refreshToken, deps.setup.key), updatedAt: now }).where(eq(calendarConnection.id, row.id));
  }
  return tokens.accessToken;
}

/** Marks a connection broken, forgets its busy times (the person falls back to typed hours) and tells its owner once. */
async function markBroken(deps: CalendarDeps, row: ConnectionRow, now: Date): Promise<void> {
  const moved = await deps.authDb.transaction(async (tx) => {
    const changed = await tx.update(calendarConnection).set({ status: "broken", updatedAt: now }).where(and(eq(calendarConnection.id, row.id), eq(calendarConnection.status, "connected"))).returning({ id: calendarConnection.id });
    await tx.delete(memberBusy).where(eq(memberBusy.connectionId, row.id));
    if (changed.length > 0) await tx.execute(sql`select public.app_calendar_connection_broken(${row.memberId}::uuid, ${row.provider})`);
    return changed.length > 0;
  });
  if (moved) console.error("A calendar connection stopped working.");
}

export type SyncResult = "synced" | "broken" | "failed" | "skipped";

/**
 * Reads one connection's events for the next 60 days and replaces its busy times in one transaction. The provider calls run outside any transaction. A refusal marks
 * the connection broken at once; any other fault counts, and the third in a row marks it broken. Titles are never asked for, so none can reach a log or the database.
 */
export async function syncConnection(deps: CalendarDeps, row: ConnectionRow, now: Date): Promise<SyncResult> {
  const provider = deps.setup.providers[row.provider as CalendarProviderName];
  if (provider === undefined) return "skipped";
  try {
    const accessToken = await accessTokenFor(deps, provider, row, now);
    const range = { start: now, end: new Date(now.getTime() + SYNC_DAYS * 86_400_000) };
    const events = await provider.listEvents(accessToken, range, { withTitles: false });
    const spans = mergeIntervals(events.filter((event) => event.busy).map((event) => ({ start: event.start, end: event.end })));
    await deps.authDb.transaction(async (tx) => {
      await tx.delete(memberBusy).where(eq(memberBusy.connectionId, row.id));
      if (spans.length > 0) await tx.insert(memberBusy).values(spans.map((span) => ({ connectionId: row.id, memberId: row.memberId, startsAt: span.start, endsAt: span.end })));
      await tx.update(calendarConnection).set({ lastSyncedAt: now, failedSyncs: 0, updatedAt: now }).where(eq(calendarConnection.id, row.id));
    });
    return "synced";
  } catch (error) {
    if (error instanceof CalendarAuthError) {
      await markBroken(deps, row, now);
      return "broken";
    }
    logFault("A calendar sync failed", error);
    const failures = row.failedSyncs + 1;
    await deps.authDb.update(calendarConnection).set({ failedSyncs: failures, updatedAt: now }).where(eq(calendarConnection.id, row.id));
    if (failures >= BROKEN_AFTER_FAILURES) {
      await markBroken(deps, row, now);
      return "broken";
    }
    return "failed";
  }
}

/** Syncs every working connection, one person at a time. A fault with one never stops the others. Runs as `leads_auth` from `pnpm leads:sweep`. */
export async function syncCalendars(deps: CalendarDeps, now: Date): Promise<Readonly<Record<SyncResult, number>>> {
  const rows = await deps.authDb.select(connectionColumns).from(calendarConnection).where(eq(calendarConnection.status, "connected"));
  const totals: Record<SyncResult, number> = { synced: 0, broken: 0, failed: 0, skipped: 0 };
  for (const row of rows) {
    try {
      totals[await syncConnection(deps, row, now)] += 1;
    } catch (error) {
      logFault("A calendar sync could not be recorded", error);
      totals.failed += 1;
    }
  }
  return totals;
}

/** What a person sees of their own calendar: the title and the times, from their own request only. */
export interface OwnEvent {
  readonly provider: CalendarProviderName;
  readonly title: string;
  readonly start: Date;
  readonly end: Date;
  readonly allDay: boolean;
}

/**
 * Reads the signed-in person's own events live, with titles, for the range on screen. Nothing is stored or cached: the result goes to that one request. A portal
 * meeting that comes back is dropped. A provider that does not answer is named in `problems` and the rest is shown.
 */
export async function readOwnEvents(deps: CalendarDeps, who: { readonly userId: string; readonly orgId: string }, range: Interval, now: Date): Promise<{ readonly events: readonly OwnEvent[]; readonly problems: readonly CalendarProviderName[] }> {
  const [person] = await deps.authDb
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, who.userId), eq(member.orgId, who.orgId), eq(member.orgKind, "client"), eq(member.status, "active")))
    .limit(1);
  if (person === undefined) return { events: [], problems: [] };
  const rows = await deps.authDb.select(connectionColumns).from(calendarConnection).where(and(eq(calendarConnection.memberId, person.id), eq(calendarConnection.status, "connected")));
  const events: OwnEvent[] = [];
  const problems: CalendarProviderName[] = [];
  for (const row of rows) {
    const provider = deps.setup.providers[row.provider as CalendarProviderName];
    if (provider === undefined) continue;
    try {
      const own: readonly CalendarEvent[] = await provider.listEvents(await accessTokenFor(deps, provider, row, now), range, { withTitles: true });
      for (const event of own) {
        if (!event.busy || event.icalUid?.endsWith(PORTAL_UID_SUFFIX) === true) continue;
        events.push({ provider: provider.name, title: event.title ?? "Busy", start: event.start, end: event.end, allDay: event.allDay });
      }
    } catch (error) {
      if (error instanceof CalendarAuthError) await markBroken(deps, row, now);
      else logFault("A calendar could not be read", error);
      problems.push(row.provider as CalendarProviderName);
    }
  }
  return { events: events.sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, 500), problems };
}
