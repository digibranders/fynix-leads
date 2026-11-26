import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { findHoursProblem, sortWindows, type HoursWindow } from "@/lib/domain/weekly-hours";
import type { Database } from "@/server/db/pool";
import { hostBlock, hostHours, member } from "@/server/db/schema";
import { withTenantScope, type ScopedTransaction } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import { DomainError } from "@/server/domain/errors";
import { ownBlockSchema, ownHoursSchema, uuidSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";

export interface HostHoursWindow {
  /** 0 is Sunday. */
  readonly weekday: number;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly timeZone: string;
}

export interface TenantHost {
  readonly memberId: string;
  readonly name: string;
  readonly jobTitle: string;
  /** True for the signed-in person: only they edit their own hours and blocked times. */
  readonly own: boolean;
  readonly hours: readonly HostHoursWindow[];
  readonly blocks: readonly { readonly id: string; readonly startsAt: Date; readonly endsAt: Date; readonly note: string | null }[];
}

/** The active people of the client's organisation, with their weekly hours and their blocked times from now on. */
export async function listClientHosts(db: Database, actor: { readonly userId: string; readonly orgId: string }, now: Date = new Date()): Promise<readonly TenantHost[]> {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const people = await tx
      .select({ memberId: member.id, name: member.displayName, jobTitle: member.jobTitle, userId: member.userId })
      .from(member)
      .where(and(eq(member.orgId, actor.orgId), eq(member.status, "active")))
      .orderBy(asc(member.displayName));
    if (people.length === 0) return [];

    const memberIds = people.map((row) => row.memberId);
    const hours = await tx
      .select({ memberId: hostHours.memberId, weekday: hostHours.weekday, startMinute: hostHours.startMinute, endMinute: hostHours.endMinute, timeZone: hostHours.timeZone })
      .from(hostHours)
      .where(inArray(hostHours.memberId, memberIds))
      .orderBy(asc(hostHours.weekday), asc(hostHours.startMinute));
    const blocks = await tx
      .select({ id: hostBlock.id, memberId: hostBlock.memberId, startsAt: hostBlock.startsAt, endsAt: hostBlock.endsAt, note: hostBlock.note })
      .from(hostBlock)
      .where(and(inArray(hostBlock.memberId, memberIds), gte(hostBlock.endsAt, now)))
      .orderBy(asc(hostBlock.startsAt));

    return people.map(
      (person): TenantHost => ({
        memberId: person.memberId,
        name: person.name,
        jobTitle: person.jobTitle ?? "",
        own: person.userId === actor.userId,
        hours: hours.filter((row) => row.memberId === person.memberId).map(({ weekday, startMinute, endMinute, timeZone }) => ({ weekday, startMinute, endMinute, timeZone })),
        blocks: blocks.filter((row) => row.memberId === person.memberId).map(({ id, startsAt, endsAt, note }) => ({ id, startsAt, endsAt, note })),
      }),
    );
  });
}

/**
 * What a client person does for themself: edits their own weekly hours and blocked times. The database decides who may (migration 0064: a person or a
 * manager writes the hours and blocks); here the refusals are plain. A person's own hours and blocks belong to them and are never refused for a closed campaign.
 */
function refusal(error: unknown): never {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  const message = cause instanceof Error ? cause.message : "";
  if (/row-level security/.test(message)) throw new DomainError("not-authorised", "You are not allowed to change that.");
  throw error;
}

function requireClient(actor: TenantActor): void {
  if (actor.orgKind !== "client") throw new DomainError("not-authorised", "Only a client can change its team's working hours.");
}

/** The signed-in person's own member row: it must exist and be active. */
async function ownMemberId(tx: ScopedTransaction, actor: TenantActor): Promise<string> {
  const [person] = await tx.select({ id: member.id, status: member.status }).from(member).where(and(eq(member.userId, actor.userId), eq(member.orgId, actor.orgId))).limit(1);
  if (person === undefined || person.status !== "active") throw new DomainError("not-authorised", "Only an active person of your organisation has working hours.");
  return person.id;
}

export interface OwnHoursRecord {
  readonly memberId: string;
  readonly timeZone: string;
  readonly hours: readonly HoursWindow[];
}

/** Replaces the signed-in person's whole weekly set, in one time zone. An empty set clears it. The same rules as the Fynix form (`findHoursProblem`). */
export async function setOwnHours(db: Database, actor: TenantActor, input: unknown): Promise<OwnHoursRecord> {
  requireClient(actor);
  const parsed = parseInput(ownHoursSchema, input);
  const problem = findHoursProblem(parsed.hours);
  if (problem !== null) throw new DomainError("invalid-input", `hours ${problem}`);
  const windows = sortWindows(parsed.hours);
  try {
    return await withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
      const memberId = await ownMemberId(tx, actor);
      await tx.delete(hostHours).where(eq(hostHours.memberId, memberId));
      if (windows.length > 0) await tx.insert(hostHours).values(windows.map((slot) => ({ memberId, timeZone: parsed.timeZone, weekday: slot.weekday, startMinute: slot.startMinute, endMinute: slot.endMinute })));
      return { memberId, timeZone: parsed.timeZone, hours: windows };
    });
  } catch (error) {
    return refusal(error);
  }
}

export interface OwnBlockRecord {
  readonly id: string;
  readonly memberId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly note: string;
}

/** Blocks a time for the signed-in person. Blocks may overlap. */
export async function addOwnBlock(db: Database, actor: TenantActor, input: unknown): Promise<OwnBlockRecord> {
  requireClient(actor);
  const parsed = parseInput(ownBlockSchema, input);
  try {
    return await withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
      const memberId = await ownMemberId(tx, actor);
      const [created] = await tx.insert(hostBlock).values({ memberId, startsAt: parsed.startsAt, endsAt: parsed.endsAt, note: parsed.note }).returning({ id: hostBlock.id, memberId: hostBlock.memberId, startsAt: hostBlock.startsAt, endsAt: hostBlock.endsAt, note: hostBlock.note });
      if (created === undefined) throw new Error("The block insert returned no row");
      return created;
    });
  } catch (error) {
    return refusal(error);
  }
}

/** Removes one of the signed-in person's own blocked times. Another person's block is "not found": the database shows a person only what they may remove. */
export async function removeOwnBlock(db: Database, actor: TenantActor, blockId: string): Promise<void> {
  requireClient(actor);
  const id = parseInput(uuidSchema, blockId);
  try {
    await withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
      const memberId = await ownMemberId(tx, actor);
      const removed = await tx.delete(hostBlock).where(and(eq(hostBlock.id, id), eq(hostBlock.memberId, memberId))).returning({ id: hostBlock.id });
      if (removed.length === 0) throw new DomainError("not-found", "There is no such blocked time.");
    });
  } catch (error) {
    refusal(error);
  }
}
