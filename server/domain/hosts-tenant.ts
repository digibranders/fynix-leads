import { and, asc, eq, gte, inArray } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import { campaign, campaignHost, hostBlock, hostHours, member } from "@/server/db/schema";
import { withTenantScope } from "@/server/db/scope";

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
  readonly campaigns: readonly string[];
  readonly hours: readonly HostHoursWindow[];
  readonly blocks: readonly { readonly id: string; readonly startsAt: Date; readonly endsAt: Date; readonly note: string | null }[];
}

/** The people of the client's organisation who take meetings, with their weekly hours and their blocked times from now on. */
export async function listClientHosts(db: Database, actor: { readonly userId: string; readonly orgId: string }, now: Date = new Date()): Promise<readonly TenantHost[]> {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const assignments = await tx
      .select({ memberId: campaignHost.memberId, jobTitle: campaignHost.jobTitle, campaignName: campaign.name, name: member.displayName })
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
        campaigns: mine.map((row) => row.campaignName),
        hours: hours.filter((row) => row.memberId === memberId).map(({ weekday, startMinute, endMinute, timeZone }) => ({ weekday, startMinute, endMinute, timeZone })),
        blocks: blocks.filter((row) => row.memberId === memberId).map(({ id, startsAt, endsAt, note }) => ({ id, startsAt, endsAt, note })),
      };
    });
  });
}
