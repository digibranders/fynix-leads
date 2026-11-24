import { asc, inArray } from "drizzle-orm";
import { meetingJoinColumns } from "@/server/db/columns";
import type { Database } from "@/server/db/pool";
import { meetingJoin } from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import type { DomainDeps } from "@/server/domain/deps";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";

/**
 * The join record of meetings, to show beside the outcome (phase 6): who joined the room, when, and for how long, as the room named them. Row-level security
 * returns the rows of the meetings the viewer can read (the client, the coordinator and its agencies, Fynix), so a meeting of someone else gives nothing. The
 * rows are written by the sweep (`importJoinRecords`) and never hold an email address.
 */
export type MeetingJoinRecord = { readonly meetingId: string; readonly displayName: string; readonly joinedAt: Date; readonly leftAt: Date | null; readonly durationSeconds: number };

export async function listMeetingJoins(db: Database, actor: TenantActor, meetingIds: readonly string[]): Promise<readonly MeetingJoinRecord[]> {
  if (meetingIds.length === 0) return [];
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) =>
    tx.select(meetingJoinColumns).from(meetingJoin).where(inArray(meetingJoin.meetingId, [...meetingIds])).orderBy(asc(meetingJoin.joinedAt)),
  );
}

export async function listMeetingJoinsForFynix(deps: Pick<DomainDeps, "fynixDb">, actor: FynixActor, meetingIds: readonly string[]): Promise<readonly MeetingJoinRecord[]> {
  if (meetingIds.length === 0) return [];
  return fynixRead(deps.fynixDb, actor, async (tx) => tx.select(meetingJoinColumns).from(meetingJoin).where(inArray(meetingJoin.meetingId, [...meetingIds])).orderBy(asc(meetingJoin.joinedAt)));
}
