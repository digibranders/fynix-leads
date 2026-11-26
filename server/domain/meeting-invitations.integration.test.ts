import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { leadNotices } from "@/lib/leads/notices";
import { agreement, aliasIdentity, campaign, campaignShare, hostBlock, hostHours, lead, leadHistory, meeting, meetingAttendee, member, user } from "@/server/db/schema";
import type { TenantActor } from "@/server/domain/alias-identity";
import { saveDraft, submitDraft } from "@/server/domain/lead-drafts";
import { loadCampaignTeams, loadCampaignTeamsForFynix } from "@/server/domain/lead-form-data";
import { submitLead } from "@/server/domain/leads";
import { expireInvitations, fynixRebookMeeting, listMyInvitations, rebookWithInvitations, remindInvitations, replyToInvitation } from "@/server/domain/meeting-invitations";
import { withdrawLead } from "@/server/domain/lead-drafts";
import { readTeamTimeForTenant } from "@/server/domain/team-availability";
import { memberIdFor, refusal, userIn } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

/**
 * Calendar step E: an agency books one slot and invites the client people who are free. The first to accept confirms the meeting and releases the others;
 * nobody left, or the deadline, sends the lead back for a new time. The data layer and its rules, as the roles the app really runs.
 */
const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});

const DAY = 86_400_000;
const agencyDb = () => rig.dbs.roles.leads_agency.db;
const clientDb = () => rig.dbs.roles.leads_client.db;
const ownerDb = () => rig.dbs.owner.db;

/** A weekday at least three days ahead, at 10:00 UTC. The people work every weekday, all day, in London. */
function slot(daysAhead = 3): Date {
  const date = new Date(Date.now() + daysAhead * DAY);
  date.setUTCHours(10, 0, 0, 0);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setTime(date.getTime() + DAY);
  return date;
}

interface Cast {
  readonly campaignId: string;
  readonly agency: TenantActor;
  readonly anna: TenantActor;
  readonly priya: TenantActor;
  readonly annaMember: string;
  readonly priyaMember: string;
  readonly alias: string;
  readonly company: string;
}
let cast: Cast;
let counter = 0;

beforeEach(async () => {
  const world = await rig.reset();
  counter = 0;
  const owner = ownerDb();
  await owner.update(campaign).set({ status: "active", timeZone: "Europe/London" });
  const target = world.campaigns.find((row) => row.agency.id === world.brightpath.id && row.client.id === world.kestrel.id);
  if (target === undefined) throw new Error("The seed has no Brightpath campaign for Kestrel");
  const annaUser = userIn(rig, world.kestrel);
  const agencyUser = userIn(rig, world.brightpath);
  await owner.update(member).set({ role: "manager" }).where(eq(member.userId, agencyUser.id));
  const annaMember = await memberIdFor(rig, annaUser.id);
  const [priyaUser] = await owner.insert(user).values({ email: "priya@kestrel-invites.example", name: "Priya Invites" }).returning({ id: user.id });
  const [priya] = await owner.insert(member).values({ userId: priyaUser?.id ?? "", orgId: world.kestrel.id, orgKind: "client", role: "member", displayName: "Priya Invites" }).returning({ id: member.id });
  for (const memberId of [annaMember, priya?.id ?? ""]) {
    for (const weekday of [1, 2, 3, 4, 5]) await owner.insert(hostHours).values({ memberId, timeZone: "Europe/London", weekday, startMinute: 0, endMinute: 1440 });
  }
  const admin = world.users[0];
  if (admin === undefined) throw new Error("No Fynix admin");
  await owner.insert(agreement).values({ campaignId: target.id, party: "client", version: 1, monthlyTarget: 12, totalTarget: 72, createdBy: await memberIdFor(rig, admin.id) });
  await owner.insert(campaignShare).values({ campaignId: target.id, agencyOrgId: world.brightpath.id, monthlyShare: 5 }).onConflictDoNothing();
  const [alias] = await owner
    .insert(aliasIdentity)
    .values({ publicRef: "ALI-9R4T", memberId: await memberIdFor(rig, agencyUser.id), clientOrgId: world.kestrel.id, displayName: "Lena Hartmann", jobTitle: "Partnerships", aliasEmail: "lena@brand.example", verifiedAt: new Date(), status: "active" })
    .returning({ id: aliasIdentity.id });
  cast = {
    campaignId: target.id,
    agency: { userId: agencyUser.id, orgId: world.brightpath.id, orgKind: "agency", role: "manager" },
    anna: { userId: annaUser.id, orgId: world.kestrel.id, orgKind: "client", role: "member" },
    priya: { userId: priyaUser?.id ?? "", orgId: world.kestrel.id, orgKind: "client", role: "member" },
    annaMember,
    priyaMember: priya?.id ?? "",
    alias: alias?.id ?? "",
    company: "Nordvik Cold Chain",
  };
});

/** An agency submits a lead with one slot and the people to invite. */
async function book(at: Date, invitees: readonly string[] = [cast.annaMember, cast.priyaMember]) {
  counter += 1;
  await submitLead(agencyDb(), rig.deps(), cast.agency, {
    campaignId: cast.campaignId,
    aliasIdentityId: cast.alias,
    hostMemberId: invitees[0],
    inviteeMemberIds: [...invitees],
    prospectName: `Marta Lindqvist ${counter}`,
    prospectTitle: "Head of Logistics",
    prospectCompany: cast.company,
    prospectDomain: `nordvik${counter}.example`,
    prospectLinkedinUrl: `https://www.linkedin.com/in/marta${counter}`,
    prospectEmail: `marta${counter}@nordvik${counter}.example`,
    bantBudget: "Confirmed",
    bantAuthority: "Signs off",
    bantNeed: "Replacing a manual process",
    bantTimeline: "One quarter",
    proposedTimes: [at.toISOString()],
  });
  // The rig's clock is fixed, so two leads share a creation time: find this one by its own email.
  const [row] = await ownerDb().select().from(lead).where(eq(lead.prospectEmail, `marta${counter}@nordvik${counter}.example`));
  const [booked] = await ownerDb().select().from(meeting).where(eq(meeting.leadId, row?.id ?? ""));
  if (row === undefined || booked === undefined) throw new Error("The booking left no lead or meeting");
  return { lead: row, meeting: booked };
}

const attendees = (meetingId: string) => ownerDb().select({ memberId: meetingAttendee.memberId, reply: meetingAttendee.reply, hash: meetingAttendee.replyTokenHash }).from(meetingAttendee).where(eq(meetingAttendee.meetingId, meetingId));
const leadRow = async (id: string) => (await ownerDb().select().from(lead).where(eq(lead.id, id)))[0];
const meetingRow = async (id: string) => (await ownerDb().select().from(meeting).where(eq(meeting.id, id)))[0];
const reply = (actor: TenantActor, meetingId: string, answer: "accepted" | "declined") => replyToInvitation(clientDb(), rig.deps(), actor, { meetingId, reply: answer });

describe("booking one slot for the people who are free", () => {
  it("books the meeting, invites each person once with a reply link of their own, and waits for a reply", async () => {
    const at = slot();
    const { lead: booked, meeting: held } = await book(at);
    expect(booked.stage).toBe("awaiting_reply");
    expect(held).toMatchObject({ outcome: "scheduled", hostMemberId: cast.annaMember, confirmedAt: null });
    expect(held.scheduledStartTime.toISOString()).toBe(at.toISOString());
    expect(held.replyDueAt?.toISOString()).toBe(new Date(at.getTime() - DAY).toISOString());
    const invited = await attendees(held.id);
    expect(invited.map((row) => [row.memberId, row.reply]).sort()).toEqual([[cast.annaMember, "invited"], [cast.priyaMember, "invited"]].sort());
    expect(new Set(invited.map((row) => row.hash)).size).toBe(2);
    expect(invited.every((row) => /^[A-Za-z0-9_-]{43}$/.test(row.hash ?? ""))).toBe(true);
  });

  it("refuses a time under 48 hours away, and leaves nothing behind", async () => {
    const soon = new Date(Date.now() + 24 * 3_600_000);
    await expect(book(soon)).rejects.toMatchObject({ code: "invalid-input" });
    expect(await ownerDb().select({ id: lead.id }).from(lead)).toEqual([]);
    expect(await ownerDb().select({ id: meeting.id }).from(meeting)).toEqual([]);
  });

  it("refuses a person who is busy then, however they came to be busy", async () => {
    const at = slot();
    await ownerDb().insert(hostBlock).values({ memberId: cast.priyaMember, startsAt: new Date(at.getTime() - 3_600_000), endsAt: new Date(at.getTime() + 3_600_000), note: "Away" });
    await expect(book(at)).rejects.toMatchObject({ code: "invalid-input", message: expect.stringContaining("not free") });
    expect(await ownerDb().select({ id: lead.id }).from(lead)).toEqual([]);
    // Without her, the same time books.
    expect((await book(at, [cast.annaMember])).lead.stage).toBe("awaiting_reply");
  });

  it("holds the time of the people invited, so a second booking for them at the same time is refused until they answer", async () => {
    const at = slot();
    await book(at);
    await expect(book(at, [cast.annaMember])).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("refuses someone who is not on the client's team", async () => {
    const stranger = await memberIdFor(rig, userIn(rig, rig.world().halden).id);
    await expect(book(slot(), [cast.annaMember, stranger])).rejects.toMatchObject({ code: "invalid-input" });
  });
});

describe("answering an invitation", () => {
  it("lets each invited person see their own invitation and nobody else's", async () => {
    const { meeting: held } = await book(slot());
    expect((await listMyInvitations(clientDb(), cast.anna)).map((row) => [row.meetingId, row.reply, row.company])).toEqual([[held.id, "invited", cast.company]]);
    expect((await listMyInvitations(clientDb(), cast.priya)).map((row) => row.meetingId)).toEqual([held.id]);
    await book(slot(5), [cast.annaMember]);
    expect(await listMyInvitations(clientDb(), cast.anna)).toHaveLength(2);
    expect(await listMyInvitations(clientDb(), cast.priya)).toHaveLength(1);
  });

  it("confirms the meeting when the first person accepts, makes them the person on it and releases the rest", async () => {
    const { lead: booked, meeting: held } = await book(slot());
    expect(await reply(cast.priya, held.id, "accepted")).toEqual({ confirmed: true, needsNewTime: false });
    expect(await meetingRow(held.id)).toMatchObject({ hostMemberId: cast.priyaMember, outcome: "scheduled" });
    expect((await meetingRow(held.id))?.confirmedAt).not.toBeNull();
    expect(await leadRow(booked.id)).toMatchObject({ stage: "scheduled", hostMemberId: cast.priyaMember });
    expect((await attendees(held.id)).map((row) => [row.memberId, row.reply]).sort()).toEqual([[cast.annaMember, "released"], [cast.priyaMember, "accepted"]].sort());
    const [history] = await ownerDb().select().from(leadHistory).where(and(eq(leadHistory.leadId, booked.id), eq(leadHistory.action, "lead.invitation_accept")));
    expect(history).toMatchObject({ actorRole: "client", fromStage: "awaiting_reply", toStage: "scheduled" });
  });

  it("changes nothing when the same answer is given twice, and lets a released person accept later without moving the meeting", async () => {
    const { meeting: held } = await book(slot());
    await reply(cast.priya, held.id, "accepted");
    expect(await reply(cast.priya, held.id, "accepted")).toEqual({ confirmed: false, needsNewTime: false });
    expect(await reply(cast.anna, held.id, "accepted")).toEqual({ confirmed: false, needsNewTime: false });
    expect((await meetingRow(held.id))?.hostMemberId).toBe(cast.priyaMember);
    expect((await attendees(held.id)).every((row) => row.reply === "accepted")).toBe(true);
    expect((await listMyInvitations(clientDb(), cast.anna)).map((row) => row.reply)).toEqual(["accepted"]);
  });

  it("waits while someone is still invited, and sends the lead back for a new time when the last person declines", async () => {
    const { lead: booked, meeting: held } = await book(slot());
    expect(await reply(cast.anna, held.id, "declined")).toEqual({ confirmed: false, needsNewTime: false });
    expect((await leadRow(booked.id))?.stage).toBe("awaiting_reply");
    expect(await reply(cast.priya, held.id, "declined")).toEqual({ confirmed: false, needsNewTime: true });
    expect((await leadRow(booked.id))?.stage).toBe("reschedule_needed");
    expect((await meetingRow(held.id))?.outcome).toBe("rescheduled");
    // The time is free again.
    expect((await book(slot(), [cast.annaMember])).lead.stage).toBe("awaiting_reply");
  });

  it("sends a confirmed meeting back for a new time when the only person going drops out", async () => {
    const { lead: booked, meeting: held } = await book(slot());
    await reply(cast.anna, held.id, "accepted");
    expect(await reply(cast.anna, held.id, "declined")).toEqual({ confirmed: false, needsNewTime: true });
    expect((await leadRow(booked.id))?.stage).toBe("reschedule_needed");
  });

  it("refuses a person who was not invited, an agency person, and an answer after the deadline", async () => {
    const { meeting: held } = await book(slot(), [cast.annaMember]);
    expect((await refusal(reply(cast.priya, held.id, "accepted"))).code).toBe("not-found");
    expect((await refusal(replyToInvitation(agencyDb(), rig.deps(), cast.agency, { meetingId: held.id, reply: "accepted" }))).code).toBe("not-authorised");
    expect((await refusal(reply(cast.anna, held.id, "maybe" as "accepted"))).code).toBe("invalid-input");
    await ownerDb().update(meeting).set({ replyDueAt: new Date(Date.now() - 1000) }).where(eq(meeting.id, held.id));
    expect((await refusal(reply(cast.anna, held.id, "accepted"))).code).toBe("invalid-transition");
  });
});

describe("the deadline", () => {
  it("lets go of a meeting nobody accepted, releases the invitations, tells the supply side and Fynix in the app, and does it once", async () => {
    const { lead: booked, meeting: held } = await book(slot());
    expect(await expireInvitations(rig.deps(), new Date())).toEqual([]);
    await ownerDb().update(meeting).set({ replyDueAt: new Date(Date.now() - 1000) }).where(eq(meeting.id, held.id));
    expect(await expireInvitations(rig.deps(), new Date())).toEqual([{ leadId: booked.id, meetingId: held.id }]);
    expect((await leadRow(booked.id))?.stage).toBe("reschedule_needed");
    expect((await meetingRow(held.id))?.outcome).toBe("rescheduled");
    expect((await attendees(held.id)).every((row) => row.reply === "released")).toBe(true);
    const [delivery] = leadNotices({ type: "reschedule_needed" });
    const notices = await ownerDb().execute<{ title: string; body: string }>(sql`select title, body from notification where title like 'A new time is needed%'`);
    expect(notices.rows.length).toBeGreaterThan(0);
    for (const row of notices.rows) {
      expect(row.title).toBe(delivery?.title.replace("{ref}", booked.publicRef));
      expect(row.body).toBe(delivery?.body.replace("{company}", cast.company));
    }
    expect(await expireInvitations(rig.deps(), new Date())).toEqual([]);
  });

  it("leaves a confirmed meeting alone", async () => {
    const { lead: booked, meeting: held } = await book(slot());
    await reply(cast.anna, held.id, "accepted");
    await ownerDb().update(meeting).set({ replyDueAt: new Date(Date.now() - 1000) }).where(eq(meeting.id, held.id));
    expect(await expireInvitations(rig.deps(), new Date())).toEqual([]);
    expect((await leadRow(booked.id))?.stage).toBe("scheduled");
  });

  it("invites the chosen people when a draft is sent, and sends it the old way without any", async () => {
    const draftFields = (n: number) => ({
      campaignId: cast.campaignId,
      aliasIdentityId: cast.alias,
      hostMemberId: cast.annaMember,
      prospectName: `Greta Voss ${n}`,
      prospectTitle: "Head of Logistics",
      prospectCompany: cast.company,
      prospectDomain: `draft${n}.example`,
      prospectLinkedinUrl: `https://www.linkedin.com/in/greta${n}`,
      prospectEmail: `greta${n}@draft${n}.example`,
      bantBudget: "Confirmed",
      bantAuthority: "Signs off",
      bantNeed: "Replacing a manual process",
      bantTimeline: "One quarter",
      proposedTimes: [slot().toISOString()],
    });
    const invited = await saveDraft(agencyDb(), rig.deps(), cast.agency, draftFields(1));
    await submitDraft(agencyDb(), rig.deps(), cast.agency, { leadId: invited.id, inviteeMemberIds: [cast.annaMember, cast.priyaMember] });
    expect((await leadRow(invited.id))?.stage).toBe("awaiting_reply");
    const [held] = await ownerDb().select().from(meeting).where(eq(meeting.leadId, invited.id));
    expect((await attendees(held?.id ?? "")).map((row) => row.reply)).toEqual(["invited", "invited"]);

    const plain = await saveDraft(agencyDb(), rig.deps(), cast.agency, draftFields(2));
    await submitDraft(agencyDb(), rig.deps(), cast.agency, { leadId: plain.id });
    expect((await leadRow(plain.id))?.stage).toBe("awaiting_client");

    const wrong = await saveDraft(agencyDb(), rig.deps(), cast.agency, draftFields(3));
    expect((await refusal(submitDraft(agencyDb(), rig.deps(), cast.agency, { leadId: wrong.id, inviteeMemberIds: [cast.priyaMember] }))).code).toBe("invalid-input");
    expect((await leadRow(wrong.id))?.stage).toBe("draft");
  });
});

describe("moving a meeting, leaving one, and the reminder", () => {
  const rebook = (leadId: string, at: Date, invitees: readonly string[] = [cast.annaMember, cast.priyaMember], actor: TenantActor = cast.agency) =>
    rebookWithInvitations(agencyDb(), rig.deps(), actor, { leadId, slot: at.toISOString(), inviteeMemberIds: [...invitees] });
  const lapse = async (meetingId: string) => {
    await ownerDb().update(meeting).set({ replyDueAt: new Date(Date.now() - 1000) }).where(eq(meeting.id, meetingId));
    await expireInvitations(rig.deps(), new Date());
  };
  const busyOf = async (memberId: string, at: Date) =>
    (await readTeamTimeForTenant(agencyDb(), cast.agency, { campaignId: cast.campaignId, from: new Date(at.getTime() - 3_600_000).toISOString(), to: new Date(at.getTime() + 3_600_000).toISOString() })).find((person) => person.memberId === memberId)?.busy.length ?? 0;

  it("books a new time for a lapsed meeting on the same meeting, and invites only the people chosen", async () => {
    const { lead: booked, meeting: held } = await book(slot(3));
    await lapse(held.id);
    expect((await leadRow(booked.id))?.stage).toBe("reschedule_needed");
    const next = slot(6);
    const moved = await rebook(booked.id, next, [cast.priyaMember]);
    expect(moved.meetingId).toBe(held.id);
    expect((await leadRow(booked.id))?.stage).toBe("awaiting_reply");
    const after = await meetingRow(held.id);
    expect(after).toMatchObject({ outcome: "scheduled", confirmedAt: null, hostMemberId: cast.priyaMember, publicRef: held.publicRef });
    expect(after?.scheduledStartTime.toISOString()).toBe(next.toISOString());
    expect(after?.replyDueAt?.toISOString()).toBe(new Date(next.getTime() - DAY).toISOString());
    expect((await attendees(held.id)).map((row) => [row.memberId, row.reply]).sort()).toEqual([[cast.annaMember, "released"], [cast.priyaMember, "invited"]].sort());
    const history = await ownerDb().select({ action: leadHistory.action }).from(leadHistory).where(eq(leadHistory.leadId, booked.id));
    expect(history.map((row) => row.action)).toContain("lead.rebook");
    // Priya accepts the new time and the lead is scheduled again.
    await reply(cast.priya, held.id, "accepted");
    expect((await leadRow(booked.id))?.stage).toBe("scheduled");
  });

  it("moves a confirmed meeting that has not started, keeps its link, and asks everyone again", async () => {
    const { lead: booked, meeting: held } = await book(slot(3));
    await reply(cast.anna, held.id, "accepted");
    await ownerDb().update(meeting).set({ googleMeetUrl: "https://meet.google.com/abc-defg-hij", googleSpaceId: "spaces/abc" }).where(eq(meeting.id, held.id));
    const sequence = (await meetingRow(held.id))?.icsSequence ?? 0;
    await rebook(booked.id, slot(7));
    const after = await meetingRow(held.id);
    expect(after).toMatchObject({ outcome: "scheduled", confirmedAt: null, googleMeetUrl: "https://meet.google.com/abc-defg-hij", publicRef: held.publicRef });
    expect(after?.icsSequence).toBeGreaterThan(sequence);
    expect((await leadRow(booked.id))?.stage).toBe("awaiting_reply");
    expect((await attendees(held.id)).every((row) => row.reply === "invited")).toBe(true);
    // The link is already there, so the person asked to accept is not given a second room.
    expect((await listMyInvitations(clientDb(), cast.priya)).find((item) => item.meetingId === held.id)?.hasRoom).toBe(true);
  });

  it("refuses a move at the wrong stage, to a busy person, or too soon", async () => {
    const { lead: booked, meeting: held } = await book(slot(3));
    // Still waiting for a reply: nothing to move yet.
    await expect(rebook(booked.id, slot(6))).rejects.toMatchObject({ code: "invalid-transition" });
    await lapse(held.id);
    await expect(rebook(booked.id, new Date(Date.now() + 24 * 3_600_000))).rejects.toMatchObject({ code: "invalid-input" });
    const next = slot(6);
    await ownerDb().insert(hostBlock).values({ memberId: cast.annaMember, startsAt: new Date(next.getTime() - 3_600_000), endsAt: new Date(next.getTime() + 3_600_000), note: "Away" });
    await expect(rebook(booked.id, next)).rejects.toMatchObject({ code: "invalid-input" });
    expect((await leadRow(booked.id))?.stage).toBe("reschedule_needed");
    expect((await rebook(booked.id, next, [cast.priyaMember])).meetingId).toBe(held.id);
  });

  it("lets the agency withdraw a lead that is waiting for a reply, which ends the hold and the invitations", async () => {
    const at = slot(3);
    const { lead: booked, meeting: held } = await book(at);
    expect(await busyOf(cast.priyaMember, at)).toBe(1);
    await withdrawLead(agencyDb(), rig.deps(), cast.agency, { leadId: booked.id });
    expect((await leadRow(booked.id))?.stage).toBe("withdrawn");
    expect((await meetingRow(held.id))?.outcome).toBe("cancelled");
    expect(await busyOf(cast.priyaMember, at)).toBe(0);
    expect(await listMyInvitations(clientDb(), cast.priya)).toEqual([]);
    await expect(reply(cast.priya, held.id, "accepted")).rejects.toMatchObject({ code: "invalid-transition" });
    await ownerDb().update(meeting).set({ replyDueAt: new Date(Date.now() - 1000) }).where(eq(meeting.id, held.id));
    expect(await expireInvitations(rig.deps(), new Date())).toEqual([]);
    expect((await leadRow(booked.id))?.stage).toBe("withdrawn");
  });

  it("does not keep the first person invited busy once they decline", async () => {
    const at = slot(3);
    const { meeting: held } = await book(at);
    expect(await busyOf(cast.annaMember, at)).toBe(1);
    await reply(cast.anna, held.id, "declined");
    expect(await busyOf(cast.annaMember, at)).toBe(0);
    expect(await busyOf(cast.priyaMember, at)).toBe(1);
  });

  it("reminds each person once, a day after the invitation, and not again", async () => {
    const { meeting: held } = await book(slot(5));
    expect(await remindInvitations(rig.deps(), new Date())).toBe(0);
    await ownerDb().update(meetingAttendee).set({ createdAt: new Date(Date.now() - 25 * 3_600_000) }).where(eq(meetingAttendee.meetingId, held.id));
    expect(await remindInvitations(rig.deps(), new Date())).toBe(2);
    expect(await remindInvitations(rig.deps(), new Date())).toBe(0);
    const notices = await ownerDb().execute<{ n: string }>(sql`select count(*)::text as n from notification where title = 'A meeting is waiting for your reply'`);
    expect(notices.rows[0]?.n).toBe("2");
    // A person who has answered is not reminded.
    await reply(cast.anna, held.id, "declined");
    expect(await remindInvitations(rig.deps(), new Date())).toBe(0);
  });

  it("lets the client of the campaign move a confirmed meeting, and tells the sending side", async () => {
    const { lead: booked, meeting: held } = await book(slot(3));
    await reply(cast.anna, held.id, "accepted");
    const next = slot(8);
    const moved = await rebookWithInvitations(clientDb(), rig.deps(), cast.priya, { leadId: booked.id, slot: next.toISOString(), inviteeMemberIds: [cast.annaMember, cast.priyaMember] });
    expect(moved.meetingId).toBe(held.id);
    expect((await leadRow(booked.id))?.stage).toBe("awaiting_reply");
    expect((await meetingRow(held.id))?.scheduledStartTime.toISOString()).toBe(next.toISOString());
    const history = await ownerDb().select({ action: leadHistory.action, role: leadHistory.actorRole }).from(leadHistory).where(eq(leadHistory.leadId, booked.id));
    expect(history.find((row) => row.action === "lead.rebook")?.role).toBe("client");
    const told = await ownerDb().execute<{ n: string }>(sql`select count(*)::text as n from notification where title like 'The meeting for % was moved'`);
    expect(Number(told.rows[0]?.n)).toBeGreaterThan(0);
  });

  it("lets Fynix move a meeting for an agency, with an audit row, and refuses a time that is too soon", async () => {
    const { lead: booked, meeting: held } = await book(slot(3));
    await lapse(held.id);
    await expect(fynixRebookMeeting(rig.deps(), rig.actor, { leadId: booked.id, slot: new Date(Date.now() + 24 * 3_600_000).toISOString(), inviteeMemberIds: [cast.annaMember] })).rejects.toMatchObject({ code: "invalid-input" });
    const next = slot(6);
    const moved = await fynixRebookMeeting(rig.deps(), rig.actor, { leadId: booked.id, slot: next.toISOString(), inviteeMemberIds: [cast.annaMember, cast.priyaMember] });
    expect(moved.meetingId).toBe(held.id);
    expect((await leadRow(booked.id))?.stage).toBe("awaiting_reply");
    const history = await ownerDb().select({ action: leadHistory.action, role: leadHistory.actorRole }).from(leadHistory).where(eq(leadHistory.leadId, booked.id));
    expect(history.find((row) => row.action === "lead.rebook")?.role).toBe("fynix");
    const audit = await ownerDb().execute<{ n: string }>(sql`select count(*)::text as n from audit_log where action = 'lead.rebook'`);
    expect(audit.rows[0]?.n).toBe("1");
  });

  it("refuses a move by a person who has nothing to do with the lead", async () => {
    const { lead: booked, meeting: held } = await book(slot(3));
    await lapse(held.id);
    const outsider = { ...cast.agency, orgId: cast.anna.orgId, orgKind: "client" as const };
    await expect(rebookWithInvitations(clientDb(), rig.deps(), { ...outsider, userId: cast.agency.userId }, { leadId: booked.id, slot: slot(6).toISOString(), inviteeMemberIds: [cast.annaMember] })).rejects.toBeInstanceOf(Error);
    expect((await leadRow(booked.id))?.stage).toBe("reschedule_needed");
  });

  it("gives the lead form and the lead record the client team of a campaign, for the agency, the client and Fynix", async () => {
    const names = (people: readonly { displayName: string }[] | undefined) => (people ?? []).map((person) => person.displayName).sort();
    const forAgency = await loadCampaignTeams(agencyDb(), rig.deps(), cast.agency, [cast.campaignId]);
    const forClient = await loadCampaignTeams(clientDb(), rig.deps(), cast.anna, [cast.campaignId]);
    const forFynix = await loadCampaignTeamsForFynix(rig.deps(), rig.actor, [cast.campaignId]);
    expect(names(forAgency[cast.campaignId])).toHaveLength(2);
    expect(names(forClient[cast.campaignId])).toEqual(names(forAgency[cast.campaignId]));
    expect(names(forFynix[cast.campaignId])).toEqual(names(forAgency[cast.campaignId]));
    // Everything a screen needs is plain text and numbers, and none of it is a title or a reason.
    expect(forAgency[cast.campaignId]?.[0]).toEqual({ memberId: expect.any(String), displayName: expect.any(String), timeZone: "Europe/London", hours: expect.any(Array), busy: expect.any(Array) });
  });
});
