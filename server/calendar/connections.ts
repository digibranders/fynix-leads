import { and, eq, sql } from "drizzle-orm";
import { decryptToken, encryptToken } from "@/server/calendar/crypto";
import { connectionColumns, syncConnection, type CalendarDeps } from "@/server/calendar/sync";
import { CALENDAR_PROVIDERS, type CalendarProviderName } from "@/server/calendar/provider";
import type { TenantActor } from "@/server/domain/alias-identity";
import { DomainError } from "@/server/domain/errors";
import type { Database } from "@/server/db/pool";
import { calendarConnection, member } from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";

export const isProviderName = (value: unknown): value is CalendarProviderName => typeof value === "string" && (CALENDAR_PROVIDERS as readonly string[]).includes(value);

/** The client member a signed-in user is, or null (an agency or Fynix person has no calendar to connect). */
export async function clientMemberId(authDb: Database, who: { readonly userId: string; readonly orgId: string }): Promise<string | null> {
  const [row] = await authDb
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, who.userId), eq(member.orgId, who.orgId), eq(member.orgKind, "client"), eq(member.status, "active")))
    .limit(1);
  return row?.id ?? null;
}

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
  await syncConnection(deps, row, now);
}

/** Ends a connection: the token is revoked where the provider allows it (a failure never stops this), then the row and its busy times are removed. */
export async function disconnectCalendar(deps: CalendarDeps, who: { readonly userId: string; readonly orgId: string }, provider: CalendarProviderName): Promise<void> {
  const memberId = await clientMemberId(deps.authDb, who);
  if (memberId === null) throw new DomainError("not-authorised", "Only a person of a client has a calendar to disconnect.");
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

/** The signed-in client person's own connections: provider, state and last sync. Never a token. */
export async function listMyCalendarConnections(db: Database, actor: TenantActor): Promise<readonly MyCalendarConnection[]> {
  if (actor.orgKind !== "client") return [];
  const rows = await withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, (tx) =>
    tx.execute<{ provider: string; status: string; last_synced_at: Date | string | null }>(sql`select provider, status, last_synced_at from public.app_my_calendar_connections()`),
  );
  return rows.rows.flatMap((row) =>
    isProviderName(row.provider) ? [{ provider: row.provider, status: row.status === "broken" ? ("broken" as const) : ("connected" as const), lastSyncedAt: row.last_synced_at === null ? null : new Date(row.last_synced_at) }] : [],
  );
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
