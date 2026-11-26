import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_HOURS } from "@/lib/leads/host-hours";
import { campaign, campaignShare, hostBlock, lead, meeting, meetingAttendee, member, organisation, user } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import type { SeededCampaign, SeededOrganisation } from "@/server/db/testing/seed";
import type { TenantActor } from "@/server/domain/alias-identity";
import { readTeamTimeForFynix, readTeamTimeForTenant, type TeamMemberTime } from "@/server/domain/team-availability";
import { memberIdFor, refusal, userIn } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

/**
 * Calendar step C: who is on a client's team and when each person is busy, for the client itself, an agency that serves it and Fynix. Names, hours and bare
 * start and end times, and never what a busy time is.
 */
const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});

const DAY = 86_400_000;
const at = (days: number, hour: number, minute = 0): Date => {
  const date = new Date(Date.now() + days * DAY);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
};
const iso = (date: Date): string => date.toISOString();
const window = () => ({ from: iso(at(1, 0)), to: iso(at(12, 0)) });
const actorIn = (org: SeededOrganisation, kind: "client" | "agency"): TenantActor => ({ userId: userIn(rig, org).id, orgId: org.id, orgKind: kind, role: "member" });

interface Cast {
  readonly served: SeededCampaign;
  readonly other: SeededCampaign;
  readonly agency: TenantActor;
  readonly client: TenantActor;
  readonly otherClient: TenantActor;
  readonly clientMember: string;
  readonly colleague: string;
}
let cast: Cast;
let counter = 0;

beforeEach(async () => {
  const world = await rig.reset();
  counter = 0;
  const owner = rig.dbs.owner.db;
  // Brightpath serves Kestrel and nobody else: Halden's campaign with it moves to Northgate. Shares are cleared so access can only come from the campaign itself.
  await owner.delete(campaignShare);
  const served = world.campaigns.find((row) => row.client.id === world.kestrel.id && row.agency.id === world.brightpath.id);
  const moved = world.campaigns.find((row) => row.client.id === world.halden.id && row.agency.id === world.brightpath.id);
  if (served === undefined || moved === undefined) throw new Error("The seed is missing a Brightpath campaign");
  await owner.update(campaign).set({ agencyOrgId: world.northgate.id }).where(eq(campaign.id, moved.id));
  const [colleagueUser] = await owner.insert(user).values({ email: "colleague@kestrel-calendar.example", name: "Colleague Calendar" }).returning({ id: user.id });
  const [colleague] = await owner.insert(member).values({ userId: colleagueUser?.id ?? "", orgId: world.kestrel.id, orgKind: "client", role: "member", displayName: "Colleague Calendar" }).returning({ id: member.id });
  cast = {
    served,
    other: { ...moved, agency: world.northgate },
    agency: actorIn(world.brightpath, "agency"),
    client: actorIn(world.kestrel, "client"),
    otherClient: actorIn(world.halden, "client"),
    clientMember: await memberIdFor(rig, userIn(rig, world.kestrel).id),
    colleague: colleague?.id ?? "",
  };
});

const agencyDb = () => rig.dbs.roles.leads_agency.db;
const clientDb = () => rig.dbs.roles.leads_client.db;
const read = (campaignId: string) => readTeamTimeForTenant(agencyDb(), cast.agency, { campaignId, ...window() });
const busyOf = (rows: readonly TeamMemberTime[], memberId: string): string[][] => (rows.find((row) => row.memberId === memberId)?.busy ?? []).map((span) => [iso(span.start), iso(span.end)]);

/** A scheduled meeting of the served campaign, written as the owner. The lead is unreleased so nothing but the owner reads it. */
async function bookMeeting(start: Date, over: { readonly outcome?: string; readonly replyDueAt?: Date | null } = {}): Promise<string> {
  counter += 1;
  const owner = rig.dbs.owner.db;
  const [row] = await owner
    .insert(lead)
    .values({
      campaignId: cast.served.id,
      sourceOrgId: cast.served.agency.id,
      submittedByUserId: userIn(rig, cast.served.agency).id,
      hostMemberId: cast.clientMember,
      released: false,
      publicRef: `LD-C${counter}XX`,
      prospectName: "Hidden Prospect",
      prospectTitle: "Head of Finance",
      prospectCompany: `Hidden Company ${counter}`,
      prospectDomain: `hidden${counter}.example`,
      prospectLinkedinUrl: `https://www.linkedin.com/in/hidden${counter}`,
      prospectEmail: `hidden${counter}@hidden.example`,
      bantBudget: "b",
      bantAuthority: "a",
      bantNeed: "n",
      bantTimeline: "t",
      submittedAt: new Date(),
      stage: "awaiting_client",
    })
    .returning({ id: lead.id });
  const [booked] = await owner
    .insert(meeting)
    .values({ publicRef: `MTG-C${counter}XX`, leadId: row?.id ?? "", campaignId: cast.served.id, hostMemberId: cast.clientMember, scheduledStartTime: start, outcome: over.outcome ?? "scheduled", replyDueAt: over.replyDueAt ?? null })
    .returning({ id: meeting.id });
  return booked?.id ?? "";
}

describe("the people and their hours", () => {
  it("gives an agency that serves the client every active person by name, with the default week when none has set hours", async () => {
    const rows = await read(cast.served.id);
    expect(rows.map((row) => row.displayName).sort()).toEqual(["Colleague Calendar", userIn(rig, cast.served.client).name].sort());
    const [org] = await rig.dbs.owner.db.select({ timeZone: organisation.timeZone }).from(organisation).where(eq(organisation.id, cast.served.client.id));
    for (const row of rows) {
      expect(row.availability.hours).toEqual(DEFAULT_HOURS);
      expect(row.availability.timeZone).toBe(org?.timeZone ?? "Europe/London");
      expect(row.busy).toEqual([]);
    }
  });

  it("leaves out a suspended person", async () => {
    await rig.dbs.owner.db.update(member).set({ status: "suspended" }).where(eq(member.id, cast.colleague));
    expect((await read(cast.served.id)).map((row) => row.memberId)).not.toContain(cast.colleague);
  });
});

describe("what makes a person busy", () => {
  it("counts a blocked time, a scheduled meeting and an open invitation, all as bare start and end times", async () => {
    await rig.dbs.owner.db.insert(hostBlock).values({ memberId: cast.colleague, startsAt: at(2, 9), endsAt: at(2, 10), note: "Dentist, private note" });
    await bookMeeting(at(3, 14));
    const invited = await bookMeeting(at(4, 11), { replyDueAt: at(9, 0) });
    await rig.dbs.owner.db.insert(meetingAttendee).values({ meetingId: invited, memberId: cast.colleague });
    const rows = await read(cast.served.id);
    expect(busyOf(rows, cast.colleague)).toEqual([[iso(at(2, 9)), iso(at(2, 10))], [iso(at(4, 11)), iso(at(4, 11, 30))]]);
    expect(busyOf(rows, cast.clientMember)).toEqual([[iso(at(3, 14)), iso(at(3, 14, 30))], [iso(at(4, 11)), iso(at(4, 11, 30))]]);
  });

  it.each([
    ["an invitation still waiting, before its deadline", "invited", 9, true],
    ["an invitation whose deadline has passed", "invited", -1, false],
    ["an accepted invitation, even after the deadline", "accepted", -1, true],
    ["a declined invitation", "declined", 9, false],
    ["a released invitation", "released", 9, false],
  ] as const)("%s", async (_label, reply, dueInDays, busy) => {
    const meetingId = await bookMeeting(at(5, 10), { replyDueAt: at(dueInDays, 0) });
    await rig.dbs.owner.db.insert(meetingAttendee).values({ meetingId, memberId: cast.colleague, reply, repliedAt: reply === "invited" ? null : new Date() });
    const rows = await read(cast.served.id);
    expect(busyOf(rows, cast.colleague)).toEqual(busy ? [[iso(at(5, 10)), iso(at(5, 10, 30))]] : []);
  });

  it("does not count a meeting that was cancelled, held or moved", async () => {
    for (const outcome of ["cancelled", "held", "rescheduled"]) {
      const meetingId = await bookMeeting(at(6, 10), { outcome });
      await rig.dbs.owner.db.insert(meetingAttendee).values({ meetingId, memberId: cast.colleague, reply: "accepted", repliedAt: new Date() });
    }
    const rows = await read(cast.served.id);
    expect(busyOf(rows, cast.colleague)).toEqual([]);
    expect(busyOf(rows, cast.clientMember)).toEqual([]);
  });

  it("only reports time inside the range asked for", async () => {
    await bookMeeting(at(20, 10));
    expect(busyOf(await read(cast.served.id), cast.clientMember)).toEqual([]);
  });

  it("tells nothing about what the busy time is", async () => {
    await rig.dbs.owner.db.insert(hostBlock).values({ memberId: cast.colleague, startsAt: at(2, 9), endsAt: at(2, 10), note: "Dentist, private note" });
    await bookMeeting(at(3, 14));
    const text = JSON.stringify(await read(cast.served.id));
    for (const forbidden of ["Dentist", "private note", "hidden1@hidden.example", "Hidden Company 1", "Hidden Prospect", "LD-C1XX", "MTG-C1XX", cast.served.name, rig.world().brightpath.name, rig.world().northgate.name]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
  });
});

describe("who may read which team", () => {
  it("gives an agency nothing for a client it has no campaign with", async () => {
    expect(await read(cast.other.id)).toEqual([]);
  });

  it("gives a client its own team and nothing of another client's", async () => {
    await rig.dbs.owner.db.insert(hostBlock).values({ memberId: cast.colleague, startsAt: at(2, 9), endsAt: at(2, 10), note: "x" });
    const own = await readTeamTimeForTenant(clientDb(), cast.client, { campaignId: cast.served.id, ...window() });
    expect(busyOf(own, cast.colleague)).toEqual([[iso(at(2, 9)), iso(at(2, 10))]]);
    expect(await readTeamTimeForTenant(clientDb(), cast.otherClient, { campaignId: cast.served.id, ...window() })).toEqual([]);
  });

  it("gives Fynix any client, staff included", async () => {
    const kestrel = await readTeamTimeForFynix(rig.deps(), rig.staffActor, { campaignId: cast.served.id, ...window() });
    const halden = await readTeamTimeForFynix(rig.deps(), rig.staffActor, { campaignId: cast.other.id, ...window() });
    expect(kestrel.length).toBeGreaterThan(0);
    expect(halden.length).toBeGreaterThan(0);
  });
});

describe("the range", () => {
  it("refuses more than 62 days, an empty range, a backwards range and a malformed one, all as invalid input", async () => {
    const id = cast.served.id;
    const over = { campaignId: id, from: iso(at(1, 0)), to: iso(at(64, 0)) };
    const empty = { campaignId: id, from: iso(at(1, 0)), to: iso(at(1, 0)) };
    const backwards = { campaignId: id, from: iso(at(3, 0)), to: iso(at(1, 0)) };
    for (const input of [over, empty, backwards, { campaignId: id, from: "tomorrow", to: "later" }, { campaignId: "nope", ...window() }]) {
      expect((await refusal(readTeamTimeForTenant(agencyDb(), cast.agency, input))).code).toBe("invalid-input");
    }
  });

  it("is refused by the database too, so a caller that skips the domain cannot read a longer range", async () => {
    const asFynix = withScope(rig.dbs.roles.leads_fynix.db, { orgId: null, userId: rig.actor.userId }, (tx) =>
      tx.execute(sql`select * from public.app_team_busy_for_campaign(${cast.served.id}::uuid, now(), now() + interval '63 days')`),
    );
    await expect(asFynix).rejects.toSatisfy((error: unknown) => {
      for (let current: unknown = error; current instanceof Error; current = current.cause) if (current.message.includes("domain:invalid-input")) return true;
      return false;
    });
  });
});
