import { and, asc, eq, gte, inArray } from "drizzle-orm";
import type { CampaignStatus } from "@/lib/domain/campaign-status";
import { findHoursProblem, sortWindows, type HoursWindow } from "@/lib/domain/weekly-hours";
import type { Database } from "@/server/db/pool";
import { campaign, campaignHost, hostBlock, hostHours, member } from "@/server/db/schema";
import { withTenantScope, type ScopedTransaction } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import { assertCampaignOpen } from "@/server/domain/campaign-rules";
import { DomainError } from "@/server/domain/errors";
import { ownBlockSchema, ownHoursSchema, tenantAddHostSchema, tenantHostSchema, uuidSchema } from "@/server/domain/inputs";
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
  readonly campaigns: readonly string[];
  /** The campaigns the host takes meetings for, with whether each is closed (a closed campaign's hosts are read only). */
  readonly assignments: readonly { readonly campaignId: string; readonly campaignName: string; readonly status: CampaignStatus }[];
  readonly hours: readonly HostHoursWindow[];
  readonly blocks: readonly { readonly id: string; readonly startsAt: Date; readonly endsAt: Date; readonly note: string | null }[];
}

/** The people of the client's organisation who take meetings, with their weekly hours and their blocked times from now on. */
export async function listClientHosts(db: Database, actor: { readonly userId: string; readonly orgId: string }, now: Date = new Date()): Promise<readonly TenantHost[]> {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const assignments = await tx
      .select({ memberId: campaignHost.memberId, jobTitle: campaignHost.jobTitle, campaignId: campaign.id, campaignName: campaign.name, status: campaign.status, name: member.displayName, userId: member.userId })
      .from(campaignHost)
      .innerJoin(campaign, eq(campaign.id, campaignHost.campaignId))
      .innerJoin(member, eq(member.id, campaignHost.memberId))
      .where(eq(campaignHost.active, true))
      .orderBy(asc(member.displayName), asc(campaign.name));
    if (assignments.length === 0) return [];

    const memberIds = [...new Set(assignments.map((row) => row.memberId))];
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

    return memberIds.map((memberId): TenantHost => {
      const mine = assignments.filter((row) => row.memberId === memberId);
      const first = mine[0];
      return {
        memberId,
        name: first?.name ?? "",
        jobTitle: first?.jobTitle ?? "",
        own: first?.userId === actor.userId,
        campaigns: mine.map((row) => row.campaignName),
        assignments: mine.map((row) => ({ campaignId: row.campaignId, campaignName: row.campaignName, status: row.status })),
        hours: hours.filter((row) => row.memberId === memberId).map(({ weekday, startMinute, endMinute, timeZone }) => ({ weekday, startMinute, endMinute, timeZone })),
        blocks: blocks.filter((row) => row.memberId === memberId).map(({ id, startsAt, endsAt, note }) => ({ id, startsAt, endsAt, note })),
      };
    });
  });
}

/**
 * What a client does for itself (phase 2): its manager adds a host from the organisation's active people and pauses one, and any person
 * edits their own weekly hours and blocked times. The database decides who may (migrations 0032 and 0064: a manager writes `campaign_host`,
 * a person or a manager writes the hours and blocks); here the refusals are plain. A closed campaign refuses host changes with
 * `campaign-closed`; a person's own hours and blocks belong to them and are never refused for that.
 */
function refusal(error: unknown): never {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  const message = cause instanceof Error ? cause.message : "";
  if (/row-level security/.test(message)) throw new DomainError("not-authorised", "You are not allowed to change that.");
  throw error;
}

function requireClient(actor: TenantActor): void {
  if (actor.orgKind !== "client") throw new DomainError("not-authorised", "Only a client can manage its hosts.");
}

function requireManager(actor: TenantActor): void {
  requireClient(actor);
  if (actor.role !== "manager") throw new DomainError("not-authorised", "Only a manager of your account can add or pause a host.");
}

export interface ClientHostRecord {
  readonly campaignId: string;
  readonly memberId: string;
  readonly jobTitle: string;
  readonly active: boolean;
}

/** The campaign must be the client's own (the database shows it no other) and open. */
async function ownOpenCampaign(tx: ScopedTransaction, actor: TenantActor, campaignId: string): Promise<{ readonly id: string; readonly clientOrgId: string }> {
  const [target] = await tx.select({ id: campaign.id, clientOrgId: campaign.clientOrgId, status: campaign.status }).from(campaign).where(eq(campaign.id, campaignId)).limit(1);
  if (target === undefined || target.clientOrgId !== actor.orgId) throw new DomainError("not-found", "There is no such campaign.");
  assertCampaignOpen(target.status);
  return target;
}

/** A client manager makes one of the organisation's active people a host of a campaign. A paused host is switched back on, with the new title. */
export async function addClientHost(db: Database, actor: TenantActor, input: unknown): Promise<ClientHostRecord> {
  requireManager(actor);
  const parsed = parseInput(tenantAddHostSchema, input);
  try {
    return await withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
      const target = await ownOpenCampaign(tx, actor, parsed.campaignId);
      const [person] = await tx.select({ id: member.id, status: member.status }).from(member).where(and(eq(member.id, parsed.memberId), eq(member.orgId, actor.orgId))).limit(1);
      if (person === undefined || person.status !== "active") throw new DomainError("not-a-client-member", "A host is an active person at your organisation.");
      const [existing] = await tx.select({ id: campaignHost.id, active: campaignHost.active }).from(campaignHost).where(and(eq(campaignHost.campaignId, target.id), eq(campaignHost.memberId, person.id))).limit(1);
      if (existing?.active === true) throw new DomainError("invalid-transition", "That person is a host of the campaign already.");
      const [saved] =
        existing === undefined
          ? await tx.insert(campaignHost).values({ campaignId: target.id, clientOrgId: target.clientOrgId, memberId: person.id, jobTitle: parsed.jobTitle }).returning({ campaignId: campaignHost.campaignId, memberId: campaignHost.memberId, jobTitle: campaignHost.jobTitle, active: campaignHost.active })
          : await tx.update(campaignHost).set({ jobTitle: parsed.jobTitle, active: true }).where(eq(campaignHost.id, existing.id)).returning({ campaignId: campaignHost.campaignId, memberId: campaignHost.memberId, jobTitle: campaignHost.jobTitle, active: campaignHost.active });
      if (saved === undefined) throw new Error("The host write returned no row");
      return saved;
    });
  } catch (error) {
    return refusal(error);
  }
}

/** A client manager pauses a host. The row stays, with its title, for the meetings the host took; adding the person again switches it back on. */
export async function pauseClientHost(db: Database, actor: TenantActor, input: unknown): Promise<ClientHostRecord> {
  requireManager(actor);
  const parsed = parseInput(tenantHostSchema, input);
  try {
    return await withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
      const target = await ownOpenCampaign(tx, actor, parsed.campaignId);
      const [existing] = await tx.select({ id: campaignHost.id, active: campaignHost.active }).from(campaignHost).where(and(eq(campaignHost.campaignId, target.id), eq(campaignHost.memberId, parsed.memberId))).limit(1);
      if (existing === undefined) throw new DomainError("not-found", "That person is not a host of the campaign.");
      if (!existing.active) throw new DomainError("invalid-transition", "That host is paused already.");
      const [saved] = await tx.update(campaignHost).set({ active: false }).where(eq(campaignHost.id, existing.id)).returning({ campaignId: campaignHost.campaignId, memberId: campaignHost.memberId, jobTitle: campaignHost.jobTitle, active: campaignHost.active });
      if (saved === undefined) throw new Error("The host write returned no row");
      return saved;
    });
  } catch (error) {
    return refusal(error);
  }
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
