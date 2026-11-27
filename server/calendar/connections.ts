import { and, eq, sql } from "drizzle-orm";
import { decryptToken, encryptToken } from "@/server/calendar/crypto";
import { memberIdOf, personWhere, type PersonRef } from "@/server/calendar/person";
import { connectionColumns, syncConnection, type CalendarDeps } from "@/server/calendar/sync";
import { CALENDAR_PROVIDERS, type CalendarProviderName } from "@/server/calendar/provider";
import { DomainError } from "@/server/domain/errors";
import type { Database } from "@/server/db/pool";
import { calendarConnection, member } from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";

export const isProviderName = (value: unknown): value is CalendarProviderName => typeof value === "string" && (CALENDAR_PROVIDERS as readonly string[]).includes(value);

/**
 * Stores a new connection (or replaces the person's earlier one for that provider, which also makes a broken one work again) and reads its calendar at once, so
 * the person's busy time is right without waiting for the next sync.
 */
export async function saveConnection(deps: CalendarDeps, input: { readonly memberId: string; readonly provider: CalendarProviderName; readonly refreshToken: string }, now: Date): Promise<void> {
  const encrypted = encryptToken(input.refreshToken, deps.setup.key);
  const [row] = await deps.authDb
    .insert(calendarConnection)
    .values({ memberId: input.memberId, provider: input.provider, refreshTokenEnc: encrypted, status: "connected", failedSyncs: 0, updatedAt: now })
    .onConflictDoUpdate({ target: [calendarConnection.memberId, calendarConnection.provider], set: { refreshTokenEnc: encrypted, status: "connected", failedSyncs: 0, updatedAt: now } })
    .returning();
  if (row === undefined) throw new Error("The connection was not saved");
  // Only a client person's busy time is kept. An agency or Fynix person is never invited to a meeting, so their calendar is read live for their own screen and nothing is stored.
  const [owner] = await deps.authDb.select({ kind: member.orgKind }).from(member).where(eq(member.id, input.memberId)).limit(1);
  if (owner?.kind === "client") await syncConnection(deps, row, now);
}

/** Ends a connection: the token is revoked where the provider allows it (a failure never stops this), then the row and its busy times are removed. */
export async function disconnectCalendar(deps: CalendarDeps, who: PersonRef, provider: CalendarProviderName): Promise<void> {
  const memberId = await memberIdOf(deps.authDb, who);
  if (memberId === null) throw new DomainError("not-authorised", "Only a signed-in person has a calendar to disconnect.");
  const [row] = await deps.authDb.select(connectionColumns).from(calendarConnection).where(and(eq(calendarConnection.memberId, memberId), eq(calendarConnection.provider, provider))).limit(1);
  if (row === undefined) return;
  try {
    await deps.setup.providers[provider]?.revoke(decryptToken(row.refreshTokenEnc, deps.setup.key));
  } catch (error) {
    console.error(`A calendar token could not be revoked (${error instanceof Error ? error.name : "unknown error"}).`);
  }
  await deps.authDb.delete(calendarConnection).where(eq(calendarConnection.id, row.id));
}

export interface MyCalendarConnection {
  readonly provider: CalendarProviderName;
  readonly status: "connected" | "broken";
  readonly lastSyncedAt: Date | null;
}

/** The signed-in person's own connections: provider, state and last sync. Never a token. Read as `leads_auth` for the one person the session names. */
export async function listMyCalendarConnections(authDb: Database, who: PersonRef): Promise<readonly MyCalendarConnection[]> {
  const rows = await authDb
    .select({ provider: calendarConnection.provider, status: calendarConnection.status, lastSyncedAt: calendarConnection.lastSyncedAt })
    .from(calendarConnection)
    .innerJoin(member, eq(member.id, calendarConnection.memberId))
    .where(personWhere(who))
    .orderBy(calendarConnection.provider);
  return rows.flatMap((row) => (isProviderName(row.provider) ? [{ provider: row.provider, status: row.status === "broken" ? ("broken" as const) : ("connected" as const), lastSyncedAt: row.lastSyncedAt }] : []));
}

export interface CalendarWarning {
  readonly personName: string;
  readonly clientName: string;
  readonly provider: CalendarProviderName;
}

/** The connections that stopped working, by person and client, for Fynix's warning on the calendar. The database answers for Fynix alone. */
export async function listCalendarWarnings(db: Database, actor: FynixActor): Promise<readonly CalendarWarning[]> {
  const rows = await fynixRead(db, actor, (tx) => tx.execute<{ member_name: string; client_name: string; provider: string }>(sql`select member_name, client_name, provider from public.app_calendar_warnings()`));
  return rows.rows.flatMap((row) => (isProviderName(row.provider) ? [{ personName: row.member_name, clientName: row.client_name, provider: row.provider }] : []));
}
