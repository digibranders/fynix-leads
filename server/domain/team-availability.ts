import { asc, inArray, sql } from "drizzle-orm";
import { assertRange, mergeIntervals, type Interval } from "@/lib/calendar/free-time";
import { withDefaultHours, type HostAvailability } from "@/lib/leads/host-hours";
import type { Database } from "@/server/db/pool";
import { hostHours } from "@/server/db/schema";
import { withTenantScope, type ScopedTransaction } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import { databaseRefusal } from "@/server/domain/db-refusal";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";
import { teamTimeSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";

/**
 * One person of a client, as every calendar reads them: a name, their working hours (the default week when they have set none) and their busy time as bare
 * start and end times, joined where they touch. Nothing says why a person is busy, and an agency learns nothing else about them: no job title, email or phone.
 */
export interface TeamMemberTime {
  readonly memberId: string;
  readonly displayName: string;
  /** Hours and zone. `blocks` is empty here: typed blocked times arrive in `busy` with everything else. */
  readonly availability: HostAvailability;
  readonly busy: readonly Interval[];
}

type PersonRow = {
  readonly member_id: string;
  readonly display_name: string;
  readonly time_zone: string | null;
};

type BusyRow = {
  readonly member_id: string;
  readonly starts_at: Date | string;
  readonly ends_at: Date | string;
};

function checkedRange(from: Date, to: Date): Interval {
  const range = { start: from, end: to };
  try {
    assertRange(range);
  } catch {
    throw new DomainError("invalid-input", "A calendar read covers at least a moment and at most 62 days.");
  }
  return range;
}

async function assemble(tx: ScopedTransaction, clientOrgId: string, range: Interval): Promise<readonly TeamMemberTime[]> {
  const people = await tx.execute<PersonRow>(sql`select member_id, display_name, time_zone from public.app_team_people(${clientOrgId}::uuid)`);
  if (people.rows.length === 0) return [];
  const ids = people.rows.map((row) => row.member_id);
  const hours = await tx
    .select({ memberId: hostHours.memberId, timeZone: hostHours.timeZone, weekday: hostHours.weekday, startMinute: hostHours.startMinute, endMinute: hostHours.endMinute })
    .from(hostHours)
    .where(inArray(hostHours.memberId, ids))
    .orderBy(asc(hostHours.weekday), asc(hostHours.startMinute));
  const busy = await tx.execute<BusyRow>(
    sql`select member_id, starts_at, ends_at from public.app_team_busy(${clientOrgId}::uuid, ${range.start.toISOString()}::timestamptz, ${range.end.toISOString()}::timestamptz)`,
  );
  return people.rows.map((person): TeamMemberTime => {
    const own = hours.filter((row) => row.memberId === person.member_id);
    const availability = withDefaultHours(
      { timeZone: own[0]?.timeZone ?? null, hours: own.map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute })), blocks: [] },
      person.time_zone,
    );
    const spans = busy.rows.filter((row) => row.member_id === person.member_id).map((row) => ({ start: new Date(row.starts_at), end: new Date(row.ends_at) }));
    return { memberId: person.member_id, displayName: person.display_name, availability, busy: mergeIntervals(spans) };
  });
}

const REFUSALS: ReadonlySet<"invalid-input"> = new Set(["invalid-input"]);

function refused(error: unknown): never {
  throw databaseRefusal(error, REFUSALS, "A calendar read covers at least a moment and at most 62 days.") ?? error;
}

/** A client reads its own team, and an agency reads the team of a client it serves. Anyone else gets an empty list: the database answers for no one it may not read. */
export async function readTeamTimeForTenant(db: Database, actor: TenantActor, input: unknown): Promise<readonly TeamMemberTime[]> {
  const parsed = parseInput(teamTimeSchema, input);
  const range = checkedRange(parsed.from, parsed.to);
  try {
    return await withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, (tx) => assemble(tx, parsed.clientOrgId, range));
  } catch (error) {
    return refused(error);
  }
}

/** Fynix reads any client's team. Open to staff. */
export async function readTeamTimeForFynix(deps: Pick<DomainDeps, "fynixDb">, actor: FynixActor, input: unknown): Promise<readonly TeamMemberTime[]> {
  const parsed = parseInput(teamTimeSchema, input);
  const range = checkedRange(parsed.from, parsed.to);
  try {
    return await fynixRead(deps.fynixDb, actor, (tx) => assemble(tx, parsed.clientOrgId, range));
  } catch (error) {
    return refused(error);
  }
}
