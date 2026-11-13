import { asc, eq } from "drizzle-orm";
import { findHoursProblem, sortWindows, type HoursWindow } from "@/lib/domain/weekly-hours";
import { hostBlock, hostHours, member } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { addHostBlockSchema, setHostHoursSchema, uuidSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { snapshotBlock, snapshotHours } from "@/server/domain/snapshots";

/**
 * When a client's person takes meetings (spec 7.3): weekly working hours in their own time zone, and blocked times. They
 * belong to the person, not to a campaign. Fynix admins set them in phase 1D; in 1E the host does. Agencies will see the free
 * blocks only (spec 5.1), computed in a later phase from these two tables.
 */

export interface HostHoursRecord {
  readonly memberId: string;
  readonly timeZone: string;
  readonly hours: readonly HoursWindow[];
}

export interface HostBlockRecord {
  readonly id: string;
  readonly memberId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly note: string;
}

/** The member must exist, be active and belong to a client. The row is locked, so one host's hours are edited by one admin at a time. */
async function requireClientMember(tx: ScopedTransaction, memberId: string): Promise<{ readonly id: string }> {
  const [person] = await tx.select({ id: member.id, orgKind: member.orgKind, status: member.status }).from(member).where(eq(member.id, memberId)).limit(1).for("update");
  if (person === undefined || person.orgKind !== "client" || person.status !== "active") {
    throw new DomainError("not-a-client-member", "Working hours belong to an active member of a client.");
  }
  return person;
}

/**
 * Replaces a host's whole weekly set with the given windows, all in one time zone, in one transaction: delete, then insert. An
 * empty set clears it. A window must be whole minutes inside one day, start before it ends, and not overlap another on its
 * day (`findHoursProblem`); the database repeats each rule. Hours are settings, so the old rows are deleted; the audit row
 * holds the old set and the new one.
 */
export async function setHostHours(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<HostHoursRecord> {
  const parsed = parseInput(setHostHoursSchema, input);
  const problem = findHoursProblem(parsed.hours);
  if (problem !== null) throw new DomainError("invalid-input", `hours ${problem}`);
  const windows = sortWindows(parsed.hours);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const person = await requireClientMember(tx, parsed.memberId);
    const before = await tx
      .select({ timeZone: hostHours.timeZone, weekday: hostHours.weekday, startMinute: hostHours.startMinute, endMinute: hostHours.endMinute })
      .from(hostHours)
      .where(eq(hostHours.memberId, person.id))
      .orderBy(asc(hostHours.weekday), asc(hostHours.startMinute));
    await tx.delete(hostHours).where(eq(hostHours.memberId, person.id));
    if (windows.length > 0) {
      await tx.insert(hostHours).values(windows.map((slot) => ({ memberId: person.id, timeZone: parsed.timeZone, weekday: slot.weekday, startMinute: slot.startMinute, endMinute: slot.endMinute })));
    }
    await audit({
      action: "host_hours.set",
      subject: { table: "host_hours", id: person.id },
      before: snapshotHours(before[0]?.timeZone ?? null, before),
      after: snapshotHours(parsed.timeZone, windows),
    });
    return { memberId: person.id, timeZone: parsed.timeZone, hours: windows };
  });
}

/** Blocks a time for a host: two instants with an offset, the end after the start. Blocks may overlap. */
export async function addHostBlock(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<HostBlockRecord> {
  const parsed = parseInput(addHostBlockSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const person = await requireClientMember(tx, parsed.memberId);
    const [created] = await tx
      .insert(hostBlock)
      .values({ memberId: person.id, startsAt: parsed.startsAt, endsAt: parsed.endsAt, note: parsed.note })
      .returning({ id: hostBlock.id, memberId: hostBlock.memberId, startsAt: hostBlock.startsAt, endsAt: hostBlock.endsAt, note: hostBlock.note });
    if (created === undefined) throw new Error("The block insert returned no row");
    await audit({ action: "host_block.add", subject: { table: "host_block", id: created.id }, before: null, after: snapshotBlock(created) });
    return created;
  });
}

/** Removes a blocked time. It is a setting, so the row is deleted and the audit row keeps what it was. */
export async function removeHostBlock(deps: DomainDeps, actor: FynixActor, blockId: string): Promise<void> {
  const id = parseInput(uuidSchema, blockId);
  await fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [existing] = await tx
      .select({ id: hostBlock.id, memberId: hostBlock.memberId, startsAt: hostBlock.startsAt, endsAt: hostBlock.endsAt, note: hostBlock.note })
      .from(hostBlock)
      .where(eq(hostBlock.id, id))
      .limit(1);
    if (existing === undefined) throw new DomainError("not-found", "There is no such blocked time.");
    await tx.delete(hostBlock).where(eq(hostBlock.id, id));
    await audit({ action: "host_block.remove", subject: { table: "host_block", id }, before: snapshotBlock(existing), after: null });
  });
}
