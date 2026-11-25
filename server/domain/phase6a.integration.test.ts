import { and, asc, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { agreement, aliasIdentity, auditLog, campaign, campaignHost, campaignShare, emailOutbox, hostHours, lead, leadReminder, meeting, meetingJoin, meetingReminder, member, notification, organisation, user } from "@/server/db/schema";
import { COUNTED_STAGES } from "@/lib/domain/counting-month";
import { publishAgreement } from "@/server/domain/agreements";
import { clientCampaignColumns, meetingJoinColumns } from "@/server/db/columns";
import type { Database } from "@/server/db/pool";
import { withTenantScope } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import { readCampaignPrivacy, setCampaignPrivacy, setProspectEmail, setProspectLetterOpening } from "@/server/domain/campaign-privacy";
import { contestOutcome, fynixDecideContest } from "@/server/domain/contests";
import { fynixAnswerForClient, fynixMarkLost } from "@/server/domain/fynix-lead-actions";
import { sendLeadReminders } from "@/server/domain/lead-sweep";
import { withdrawLead } from "@/server/domain/lead-drafts";
import { clientReviewLead, decideLead, fynixOverturnRejection, listClientLeads, submitLead } from "@/server/domain/leads";
import { fynixRecordMeetingOutcome, listClientMeetings, recordMeetingOutcome } from "@/server/domain/meetings";
import { listMeetingJoins, listMeetingJoinsForFynix } from "@/server/domain/meeting-joins";
import { pickPostponement, proposePostponement } from "@/server/domain/postponement";
import { createPartnerAgency } from "@/server/domain/coordinators";
import { requestRejectionReview } from "@/server/domain/rejection-reviews";
import { refusal } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";
import { importJoinRecords, sendMeetingReminderEmails, sendReminderEmails, sendWaitingReminders, sweepLeadsWithEmails } from "@/server/mail/launch-sweep";
import { drainOutbox } from "@/server/mail/outbox";
import { FakeTransport } from "@/server/mail/testing";
import type { JoinEntry, MeetProvider } from "@/server/meet/provider";

/**
 * Phase 6 chunk A, as the roles the app really runs: the launch emails queued at every lead event for the right people, never for the person who acted, nothing
 * at all while the switches are off, the prospect letter in the alias's name with its privacy line, the calendar file's sequence, the time-based reminders,
 * the Meet room made at booking and the join record read after the meeting.
 */
const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});

const PROSPECT_PHONE = "+44 7911 123456";

interface Cast {
  readonly campaignId: string;
  readonly clientActor: TenantActor;
  readonly clientColleague: TenantActor;
  readonly coordinator: TenantActor;
  readonly coordinatorColleague: TenantActor;
  readonly partner: TenantActor;
  readonly otherAgency: TenantActor;
  readonly otherClient: TenantActor;
  readonly fynixAdmin: string;
  readonly fynixStaff: string;
  readonly hostMemberId: string;
  readonly coordinatorAlias: string;
  readonly partnerAlias: string;
  readonly partnerOrgId: string;
}

let cast: Cast;
let counter = 0;
const clientDb = () => rig.dbs.roles.leads_client.db;
const agencyDb = () => rig.dbs.roles.leads_agency.db;
const fynixDb = () => rig.dbs.roles.leads_fynix.db;
const ownerDb = () => rig.dbs.owner.db;
const asTenant = <T>(db: Database, actor: TenantActor, work: Parameters<typeof withTenantScope<T>>[2]) => withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, work);

beforeEach(async () => {
  const world = await rig.reset();
  counter = 0;
  const owner = ownerDb();
  await owner.update(campaign).set({ status: "active", timeZone: "Europe/London" });
  const target = world.campaigns.find((row) => row.agency.id === world.brightpath.id);
  if (target === undefined) throw new Error("The seed has no campaign served by Brightpath");
  const person = (orgId: string) => {
    const found = world.users.find((candidate) => candidate.organisation.id === orgId);
    if (found === undefined) throw new Error("The seed is missing a person");
    return found;
  };
  const memberOf = async (userId: string): Promise<string> => {
    const [row] = await owner.select({ id: member.id }).from(member).where(eq(member.userId, userId));
    if (row === undefined) throw new Error("No member");
    return row.id;
  };
  const addPerson = async (orgId: string, orgKind: "client" | "agency", name: string, email: string, role: "member" | "manager" = "member") => {
    const [created] = await owner.insert(user).values({ email, name }).returning({ id: user.id });
    if (created === undefined) throw new Error("No user");
    const [row] = await owner.insert(member).values({ userId: created.id, orgId, orgKind, role, displayName: name }).returning({ id: member.id });
    if (row === undefined) throw new Error("No member");
    return { userId: created.id, memberId: row.id };
  };
  const clientUser = person(target.client.id);
  const coordinatorUser = person(world.brightpath.id);
  await owner.update(member).set({ role: "manager" }).where(eq(member.userId, clientUser.id));
  await owner.update(member).set({ role: "manager" }).where(eq(member.userId, coordinatorUser.id));
  const clientMember = await memberOf(clientUser.id);
  const coordinatorMember = await memberOf(coordinatorUser.id);
  await owner.insert(campaignHost).values({ campaignId: target.id, clientOrgId: target.client.id, memberId: clientMember, jobTitle: "Chief Operating Officer" });
  for (const weekday of [1, 2, 3, 4, 5]) await owner.insert(hostHours).values({ memberId: clientMember, timeZone: "Europe/London", weekday, startMinute: 0, endMinute: 1440 });
  const admin = world.users[0];
  if (admin === undefined) throw new Error("No Fynix admin");
  await owner.insert(agreement).values({ campaignId: target.id, party: "client", version: 1, monthlyTarget: 12, totalTarget: 72, createdBy: await memberOf(admin.id) });
  await owner.insert(campaignShare).values({ campaignId: target.id, agencyOrgId: world.brightpath.id, monthlyShare: 5 }).onConflictDoNothing();
  const verifiedAlias = async (memberId: string, displayName: string, email: string, ref: string): Promise<string> => {
    const [row] = await owner
      .insert(aliasIdentity)
      .values({ publicRef: ref, memberId, clientOrgId: target.client.id, displayName, jobTitle: "Business development", aliasEmail: email, verifiedAt: new Date(), status: "active" })
      .returning({ id: aliasIdentity.id });
    if (row === undefined) throw new Error("No alias");
    return row.id;
  };
  const coordinatorAlias = await verifiedAlias(coordinatorMember, "Lena Hartmann", "lena@brand.example", "ALI-3M2K");

  const partnerOrg = await createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: world.brightpath.id, name: "Ridgeway Partner Ltd" });
  const partnerPerson = await addPerson(partnerOrg.id, "agency", "Pia Ridgeway", "pia@ridgeway.example", "manager");
  await owner.insert(campaignShare).values({ campaignId: target.id, agencyOrgId: partnerOrg.id, monthlyShare: 3 });
  const partnerAlias = await verifiedAlias(partnerPerson.memberId, "Piet Ridge", "piet@ridgeway-brand.example", "ALI-9R4T");

  const clientColleague = await addPerson(target.client.id, "client", "Colin Kestrel", "colin@kestrel.example");
  const coordinatorColleague = await addPerson(world.brightpath.id, "agency", "Cora Bright", "cora@brightpath.example");

  const otherAgencyUser = person(world.northgate.id);
  const otherClientUser = person(world.halden.id);
  await owner.update(member).set({ role: "manager" }).where(eq(member.userId, otherAgencyUser.id));
  await owner.update(member).set({ role: "manager" }).where(eq(member.userId, otherClientUser.id));
  const fynixStaff = world.users.find((candidate) => candidate.organisation.kind === "fynix" && candidate.role === "member");
  if (fynixStaff === undefined) throw new Error("No Fynix staff");
  cast = {
    campaignId: target.id,
    clientActor: { userId: clientUser.id, orgId: target.client.id, orgKind: "client", role: "manager" },
    clientColleague: { userId: clientColleague.userId, orgId: target.client.id, orgKind: "client", role: "member" },
    coordinator: { userId: coordinatorUser.id, orgId: world.brightpath.id, orgKind: "agency", role: "manager" },
    coordinatorColleague: { userId: coordinatorColleague.userId, orgId: world.brightpath.id, orgKind: "agency", role: "member" },
    partner: { userId: partnerPerson.userId, orgId: partnerOrg.id, orgKind: "agency", role: "manager" },
    otherAgency: { userId: otherAgencyUser.id, orgId: world.northgate.id, orgKind: "agency", role: "manager" },
    otherClient: { userId: otherClientUser.id, orgId: world.halden.id, orgKind: "client", role: "manager" },
    fynixAdmin: admin.id,
    fynixStaff: fynixStaff.id,
    hostMemberId: clientMember,
    coordinatorAlias,
    partnerAlias,
    partnerOrgId: partnerOrg.id,
  };
});

function nextWeekdayAt(hour: number, daysAhead: number): string {
  const date = new Date(Date.now() + daysAhead * 86_400_000);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

interface Sent {
  readonly leadId: string;
  readonly publicRef: string;
  readonly time: string;
}

/** An agency submits a lead whose prospect has an email and a phone, so a notice that leaked either would show. */
async function sent(from: "coordinator" | "partner" = "coordinator", time = nextWeekdayAt(10, 3)): Promise<Sent> {
  counter += 1;
  const sender = from === "coordinator" ? cast.coordinator : cast.partner;
  const email = `marta${counter}@nordvik-cold.example`;
  await submitLead(agencyDb(), rig.deps(), sender, {
    campaignId: cast.campaignId,
    aliasIdentityId: from === "coordinator" ? cast.coordinatorAlias : cast.partnerAlias,
    hostMemberId: cast.hostMemberId,
    prospectName: `Marta Lindqvist ${counter}`,
    prospectTitle: "Head of Logistics",
    prospectCompany: `Nordvik Cold Chain ${counter}`,
    prospectDomain: "nordvik-cold.example",
    prospectLinkedinUrl: `https://www.linkedin.com/in/marta${counter}`,
    prospectEmail: email,
    prospectPhone: PROSPECT_PHONE,
    bantBudget: "Confirmed",
    bantAuthority: "Signs off",
    bantNeed: "Replacing a manual process",
    bantTimeline: "One quarter",
    proposedTimes: [time, nextWeekdayAt(14, 4)],
  });
  const created = (await listClientLeads(clientDb(), cast.clientActor)).find((row) => row.prospectEmail === email);
  if (created === undefined) throw new Error("No lead");
  return { leadId: created.id, publicRef: created.publicRef, time };
}

async function booked(from: "coordinator" | "partner" = "coordinator") {
  const one = await sent(from);
  await clientReviewLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, action: "accept", selectedMeetingTime: one.time });
  const meeting = (await listClientMeetings(clientDb(), cast.clientActor)).find((row) => row.leadId === one.leadId);
  if (meeting === undefined) throw new Error("No meeting");
  return { ...one, meetingId: meeting.id };
}

const ids = (...people: readonly (TenantActor | string)[]): string[] => people.map((entry) => (typeof entry === "string" ? entry : entry.userId)).sort();

async function denied(work: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await work;
  } catch (error) {
    const messages: string[] = [];
    for (let current: unknown = error; current instanceof Error; current = current.cause) messages.push(current.message);
    expect(messages.join(" | ")).toMatch(pattern);
    return;
  }
  throw new Error(`Expected a refusal matching ${pattern}, but the statement was allowed.`);
}


const ORIGIN = "https://leads.example";
const PRIVACY = "https://privacy.kestrel-logistics.example/policy";
const NEUTRAL = { email: "meetings@neutral.example", name: "Meetings" } as const;

afterEach(() => {
  vi.unstubAllEnvs();
});
/** Turns the launch emails on the way a deploy would: the switch, the origin and a neutral sender address. */
function emailsOn(): void {
  vi.stubEnv("LAUNCH_EMAILS_ENABLED", "true");
  vi.stubEnv("APP_ORIGIN", ORIGIN);
  vi.stubEnv("MAIL_SENDER_ADDRESS", NEUTRAL.email);
  vi.stubEnv("MAIL_SENDER_NAME", NEUTRAL.name);
}
/** The client's privacy link and the prospect email switch, set by the Fynix admin through the service. */
async function prospectEmailOn(): Promise<void> {
  await setCampaignPrivacy(rig.deps(), rig.actor, cast.campaignId, PRIVACY);
  await setProspectEmail(rig.deps(), rig.actor, cast.campaignId, true);
}

interface Mail {
  readonly id: string;
  readonly recipient: string;
  readonly template: string;
  readonly params: Record<string, unknown>;
  readonly link: string | null;
  readonly senderName: string | null;
  readonly replyTo: string | null;
  readonly subject: string;
  readonly body: string;
  readonly status: string;
  readonly lastError: string | null;
}
async function mails(template?: string): Promise<Mail[]> {
  const rows = await ownerDb()
    .select({ id: emailOutbox.id, recipient: emailOutbox.recipient, template: emailOutbox.template, params: emailOutbox.params, link: emailOutbox.link, senderName: emailOutbox.senderName, replyTo: emailOutbox.replyTo, subject: emailOutbox.subject, body: emailOutbox.body, status: emailOutbox.status, lastError: emailOutbox.lastError })
    .from(emailOutbox)
    .orderBy(asc(emailOutbox.createdAt), asc(emailOutbox.id));
  return rows.filter((row) => template === undefined || row.template === template).map((row) => ({ ...row, params: row.params as Record<string, unknown> }));
}
/** The people (by user id) an email of this template went to. A prospect is reported by address. */
async function whoGot(template: string): Promise<string[]> {
  const people = await ownerDb().select({ id: user.id, email: user.email }).from(user);
  const byEmail = new Map(people.map((person) => [person.email, person.id]));
  return (await mails(template)).map((row) => byEmail.get(row.recipient) ?? row.recipient).sort();
}
const fynixPeople = (): string[] => [cast.fynixAdmin, cast.fynixStaff];
const clearMail = () => ownerDb().delete(emailOutbox);
const drain = (transport: FakeTransport, options: { readonly launchEmails?: boolean; readonly sender?: { readonly email: string; readonly name: string } } = {}) =>
  // A second ahead of the clock: the table's default `next_attempt_at` has microseconds, so a row queued a moment ago is not always due at the same millisecond.
  drainOutbox(rig.dbs.roles.leads_auth.db, transport, { origin: ORIGIN, launchEmails: options.launchEmails ?? true, sender: options.sender ?? NEUTRAL, now: () => new Date(Date.now() + 1000) });
const meetingRow = async (meetingId: string) => {
  const [row] = await ownerDb().select({ icsSequence: meeting.icsSequence, url: meeting.googleMeetUrl, space: meeting.googleSpaceId, start: meeting.scheduledStartTime, outcome: meeting.outcome, joinImportedAt: meeting.joinImportedAt }).from(meeting).where(eq(meeting.id, meetingId));
  if (row === undefined) throw new Error("No meeting");
  return row;
};
const authDb = () => rig.dbs.roles.leads_auth.db;
const hours = (from: Date | string, count: number): Date => new Date(new Date(from).getTime() + count * 3_600_000);

describe("the switches are off", () => {
  it("a whole lead from submission to acceptance, with a postponement and a contest, writes no email at all, and the sweep does nothing extra", async () => {
    const one = await booked();
    await proposePostponement(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, proposedTimes: [nextWeekdayAt(11, 6)] });
    const [proposal] = await asTenant(clientDb(), cast.clientActor, (tx) => tx.execute<{ id: string }>(sql`select id from meeting_reschedule where meeting_id = ${one.meetingId}::uuid`)).then((result) => result.rows);
    await pickPostponement(clientDb(), rig.deps(), cast.clientActor, { rescheduleId: proposal?.id, pickedTime: nextWeekdayAt(11, 6) });
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, outcome: "held" });
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, decision: "accept", note: "A strong fit for us" });
    const second = await booked();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: second.meetingId, outcome: "held" });
    const outcomeAt = (await ownerDb().select({ at: lead.outcomeRecordedAt }).from(lead).where(eq(lead.id, second.leadId)))[0]?.at ?? new Date();
    const swept = await sweepLeadsWithEmails(authDb(), hours(outcomeAt, 49), { enabled: false });
    expect(swept.map((row) => row.publicRef)).toEqual([second.publicRef]);
    expect(await mails()).toEqual([]);
    // The notices in the app are unaffected: the calendar file's sequence and the reminders are kept by the database whatever the switch says.
    expect((await meetingRow(one.meetingId)).icsSequence).toBe(1);
    expect(await ownerDb().select({ id: meetingReminder.id }).from(meetingReminder).where(eq(meetingReminder.meetingId, one.meetingId))).toHaveLength(4);
  });

  it("anything but the word true is off, whatever else is set", async () => {
    vi.stubEnv("LAUNCH_EMAILS_ENABLED", "yes");
    vi.stubEnv("APP_ORIGIN", ORIGIN);
    vi.stubEnv("MAIL_SENDER_ADDRESS", NEUTRAL.email);
    await booked();
    expect(await mails()).toEqual([]);
  });

  it("with the switch on at the sender but off in the sweep, launch emails already queued stay pending and the account emails still go", async () => {
    emailsOn();
    await sent();
    const queued = await mails();
    expect(queued.length).toBeGreaterThan(0);
    await ownerDb().insert(emailOutbox).values({ recipient: "reset@example.com", template: "password_reset", subject: "s", body: "b", params: { expiresInMinutes: 60 }, link: `${ORIGIN}/reset-password?token=t` });
    const transport = new FakeTransport();
    const result = await drain(transport, { launchEmails: false });
    expect(result).toMatchObject({ claimed: 1, sent: 1 });
    expect(transport.sent.map((mail) => mail.to)).toEqual(["reset@example.com"]);
    expect((await mails()).filter((row) => row.status === "pending")).toHaveLength(queued.length);
  });
});

describe("a submitted lead, a proposal of other times and a booked meeting", () => {
  it("emails the client's people asking for a time and Fynix, the coordinator too when a partner agency sent it, one address per message and never the sender", async () => {
    emailsOn();
    await sent("coordinator");
    expect(await whoGot("lead_waiting")).toEqual(ids(cast.clientActor, cast.clientColleague));
    expect(await whoGot("lead_submitted_info")).toEqual(ids(...fynixPeople()));
    await clearMail();
    await sent("partner");
    expect(await whoGot("lead_waiting")).toEqual(ids(cast.clientActor, cast.clientColleague));
    expect(await whoGot("lead_submitted_info")).toEqual(ids(cast.coordinator, cast.coordinatorColleague, ...fynixPeople()));
    for (const row of await mails()) {
      expect(row.recipient).toMatch(/^[^@\s,;<>]+@[^@\s,;<>]+$/);
      expect(row.body).not.toMatch(/https?:\/\//);
    }
    const all = await mails();
    expect(new Set(all.map((row) => `${row.template}:${row.recipient}`)).size).toBe(all.length);
  });

  it("gives each person a link to the lead in their own portal, on the application's origin, and the stored text has no link", async () => {
    emailsOn();
    const one = await sent("partner");
    const people = await ownerDb().select({ id: user.id, email: user.email }).from(user);
    const idOf = (email: string) => people.find((person) => person.email === email)?.id;
    for (const row of await mails()) {
      const id = idOf(row.recipient);
      const expected = id === cast.clientActor.userId || id === cast.clientColleague.userId ? `/client/leads/${one.publicRef}` : id === cast.coordinator.userId || id === cast.coordinatorColleague.userId ? `/coordinator/leads/${one.publicRef}` : `/fynix/leads/${one.publicRef}`;
      expect(row.link, row.template).toBe(`${ORIGIN}${expected}`);
    }
  });

  it("emails the supply side and Fynix when the client proposes other times", async () => {
    emailsOn();
    const one = await sent();
    await clearMail();
    await clientReviewLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, action: "propose_times", proposedTimes: [nextWeekdayAt(15, 5)] });
    expect(await whoGot("times_proposed_info")).toEqual(ids(cast.coordinator, cast.coordinatorColleague, ...fynixPeople()));
  });

  it("emails the meeting to the client contacts who want it (not the one who picked it), the supply side and Fynix, with the calendar file's first sequence; a client contact who opted out gets none", async () => {
    emailsOn();
    await ownerDb().update(member).set({ meetingEmails: false }).where(eq(member.userId, cast.clientColleague.userId));
    const one = await sent();
    await clearMail();
    await clientReviewLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, action: "accept", selectedMeetingTime: one.time });
    expect(await whoGot("meeting_booked")).toEqual(ids(cast.coordinator, cast.coordinatorColleague, ...fynixPeople()));
    const [booking] = await mails("meeting_booked");
    expect(booking?.params).toMatchObject({ ref: one.publicRef, calendar: { sequence: 0 } });
    expect(booking?.params.meetUrl).toBeNull();
    await ownerDb().update(member).set({ meetingEmails: true }).where(eq(member.userId, cast.clientColleague.userId));
  });

  it("writes no prospect letter until the campaign has a privacy link and the switch, and then writes exactly one, in the alias's name", async () => {
    emailsOn();
    const first = await sent();
    await clientReviewLead(clientDb(), rig.deps(), cast.clientActor, { leadId: first.leadId, action: "accept", selectedMeetingTime: first.time });
    expect(await mails("prospect_confirmed")).toEqual([]);

    await prospectEmailOn();
    const second = await sent();
    await clientReviewLead(clientDb(), rig.deps(), cast.clientActor, { leadId: second.leadId, action: "accept", selectedMeetingTime: second.time });
    const letters = await mails("prospect_confirmed");
    expect(letters).toHaveLength(1);
    const [letter] = letters;
    expect(letter).toMatchObject({ recipient: "marta2@nordvik-cold.example", senderName: "Lena Hartmann", replyTo: "lena@brand.example", link: null, status: "pending" });
    expect(letter?.params).toMatchObject({ prospectName: "Marta Lindqvist 2", signerName: "Lena Hartmann", signerTitle: "Business development", privacyUrl: PRIVACY, calendar: { sequence: 0 } });
    expect(letter?.params.clientBrand).toBe(rig.world().campaigns[0]?.client.name);
  });

  it("does not queue a prospect letter when no neutral sender address is set, even with the campaign switched on", async () => {
    emailsOn();
    vi.stubEnv("MAIL_SENDER_ADDRESS", "");
    await prospectEmailOn();
    const one = await sent();
    await clientReviewLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, action: "accept", selectedMeetingTime: one.time });
    expect(await mails("prospect_confirmed")).toEqual([]);
    expect((await mails("meeting_booked")).length).toBeGreaterThan(0);
  });

  it("does not write a prospect letter for a lead whose alias is not verified", async () => {
    emailsOn();
    await prospectEmailOn();
    const one = await sent();
    await ownerDb().update(aliasIdentity).set({ verifiedAt: null });
    await clientReviewLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, action: "accept", selectedMeetingTime: one.time });
    expect(await mails("prospect_confirmed")).toEqual([]);
  });
});

describe("what leaves the building", () => {
  it("sends the prospect letter in the alias's name from the neutral address, replies to the alias mailbox, names nobody it must not and carries the calendar file", async () => {
    emailsOn();
    await prospectEmailOn();
    const one = await sent();
    await clearMail();
    await clientReviewLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, action: "accept", selectedMeetingTime: one.time });
    const transport = new FakeTransport();
    const result = await drain(transport);
    expect(result.failed).toBe(0);
    expect(result.sent).toBe(transport.sent.length);
    const letter = transport.sent.find((mail) => mail.to === "marta1@nordvik-cold.example");
    expect(letter).toBeDefined();
    expect(letter?.fromName).toBe("Lena Hartmann");
    expect(letter?.replyTo).toBe("lena@brand.example");
    expect(letter?.text).toContain("holds your contact details to arrange this meeting. Privacy policy: https://privacy.kestrel-logistics.example/policy");
    expect(letter?.text).toContain("To have your details removed, reply to this email.");
    const file = letter?.attachments?.[0];
    expect(file?.name).toBe("meeting.ics");
    const ics = Buffer.from(file?.contentBase64 ?? "", "base64").toString("utf8");
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("SEQUENCE:0");
    expect(ics.replace(/\r\n /g, "")).toContain("mailto:marta1@nordvik-cold.example");
    expect(ics).toContain(`ORGANIZER;CN="Lena Hartmann":mailto:${NEUTRAL.email}`);
    // Everything the prospect receives, headers included, is searched for what it must not hold.
    const world = await ownerDb().select({ name: sql<string>`o.name` }).from(sql`organisation o`);
    const forbidden = [/fynix/i, /brightpath/i, /ridgeway/i, ...world.map((row) => new RegExp(row.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")).filter((pattern) => !/kestrel/i.test(pattern.source))];
    const everything = [letter?.subject, letter?.text, letter?.html, letter?.fromName, letter?.replyTo, ics, NEUTRAL.email].join("\n");
    for (const pattern of forbidden) expect(everything, String(pattern)).not.toMatch(pattern);
    expect(everything).not.toContain(ORIGIN);
    // Every other message of the same event went to one person, and the staff ones carry a file too.
    expect(transport.sent.every((mail) => !mail.to.includes(","))).toBe(true);
    expect(transport.sent.filter((mail) => mail.attachments?.length === 1)).toHaveLength(transport.sent.filter((mail) => /Meeting booked/.test(mail.subject) || mail.to === "marta1@nordvik-cold.example").length);
    expect((await mails()).every((row) => row.link === null || row.status === "pending" || row.status === "failed")).toBe(true);
  });

  it("never sends a prospect letter from an address that names Fynix: it waits for a neutral one", async () => {
    emailsOn();
    await prospectEmailOn();
    const one = await sent();
    await clearMail();
    await clientReviewLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, action: "accept", selectedMeetingTime: one.time });
    const transport = new FakeTransport();
    await drain(transport, { sender: { email: "hello@fynix.digital", name: "Fynix" } });
    expect(transport.sent.some((mail) => mail.to === "marta1@nordvik-cold.example")).toBe(false);
    const [letter] = await mails("prospect_confirmed");
    expect(letter).toMatchObject({ status: "pending", lastError: "no neutral sender address is set" });
  });

  it("refuses a stored meeting link that is not on meet.google.com: the row fails for good and nothing is sent", async () => {
    emailsOn();
    await prospectEmailOn();
    const one = await sent();
    await clearMail();
    await clientReviewLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, action: "accept", selectedMeetingTime: one.time });
    await ownerDb().execute(sql`update email_outbox set params = jsonb_set(params, '{meetUrl}', '"https://evil.example/abc-defg-hij"') where template = 'prospect_confirmed'`);
    const transport = new FakeTransport();
    await drain(transport);
    expect(transport.sent.some((mail) => mail.to === "marta1@nordvik-cold.example")).toBe(false);
    expect((await mails("prospect_confirmed"))[0]).toMatchObject({ status: "failed", lastError: "the stored content could not be rendered" });
  });

  it("refuses a link on a letter that carries none, and a portal email whose link is off the origin", async () => {
    emailsOn();
    await prospectEmailOn();
    const one = await sent();
    await clearMail();
    await clientReviewLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, action: "accept", selectedMeetingTime: one.time });
    await ownerDb().execute(sql`update email_outbox set link = 'https://evil.example/x' where template in ('prospect_confirmed', 'meeting_booked')`);
    const transport = new FakeTransport();
    await drain(transport);
    expect(transport.sent).toEqual([]);
    expect((await mails("prospect_confirmed"))[0]?.lastError).toBe("a message with no link carried one");
    expect((await mails("meeting_booked"))[0]?.lastError).toBe("the link is not on the application origin");
  });
});

describe("postponing and cancelling", () => {
  it("emails the new time with a sequence that rises, to the prospect and to everyone but the person who picked it", async () => {
    emailsOn();
    await prospectEmailOn();
    const one = await booked();
    await clearMail();
    const later = nextWeekdayAt(11, 6);
    await proposePostponement(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, proposedTimes: [later] });
    // A proposal tells the side that picks, and nothing goes to the prospect until a new time is picked.
    expect((await mails()).map((row) => row.template).filter((template) => template !== "postponement_proposed_info")).toEqual([]);
    await clearMail();
    const [proposal] = await asTenant(clientDb(), cast.clientActor, (tx) => tx.execute<{ id: string }>(sql`select id from meeting_reschedule where meeting_id = ${one.meetingId}::uuid`)).then((result) => result.rows);
    await pickPostponement(clientDb(), rig.deps(), cast.clientActor, { rescheduleId: proposal?.id, pickedTime: later });
    expect((await meetingRow(one.meetingId)).icsSequence).toBe(1);
    expect(await whoGot("meeting_moved")).toEqual(ids(cast.coordinator, cast.coordinatorColleague, cast.clientColleague, ...fynixPeople()));
    const [letter] = await mails("prospect_moved");
    expect(letter?.params).toMatchObject({ calendar: { meetingRef: expect.stringMatching(/^MTG-/), startsAt: later, sequence: 1 } });
    // Moving it again raises it again.
    const again = nextWeekdayAt(12, 7);
    await proposePostponement(clientDb(), rig.deps(), cast.clientActor, { meetingId: one.meetingId, proposedTimes: [again] });
    const [second] = await asTenant(agencyDb(), cast.coordinator, (tx) => tx.execute<{ id: string }>(sql`select id from meeting_reschedule where meeting_id = ${one.meetingId}::uuid and status = 'open'`)).then((result) => result.rows);
    await pickPostponement(agencyDb(), rig.deps(), cast.coordinator, { rescheduleId: second?.id, pickedTime: again });
    expect((await meetingRow(one.meetingId)).icsSequence).toBe(2);
    expect((await mails("prospect_moved")).map((row) => (row.params.calendar as { sequence: number }).sequence)).toEqual([1, 2]);
  });

  it("emails the cancellation when the client rejects before the meeting: the note, as from Client, to the supply side only, the cancelled letter to the prospect, a sequence that rises", async () => {
    emailsOn();
    await prospectEmailOn();
    const one = await booked();
    await clearMail();
    await clientReviewLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, action: "decline", declineReason: `Not for us, call me on ${PROSPECT_PHONE} or marta1@nordvik-cold.example` });
    const cancelled = await mails("meeting_cancelled");
    const people = await ownerDb().select({ id: user.id, email: user.email }).from(user);
    const noteTo = cancelled.filter((row) => row.params.note !== undefined).map((row) => people.find((person) => person.email === row.recipient)?.id).sort();
    expect(noteTo).toEqual(ids(cast.coordinator, cast.coordinatorColleague));
    expect(cancelled.find((row) => row.params.note !== undefined)?.params).toMatchObject({ noteFrom: "Client", reason: "rejected" });
    expect(JSON.stringify(cancelled.map((row) => row.params))).not.toMatch(/7911|marta1@/);
    expect(await whoGot("meeting_cancelled")).toEqual(ids(cast.coordinator, cast.coordinatorColleague, cast.clientColleague, ...fynixPeople()));
    const [letter] = await mails("prospect_cancelled");
    expect(letter?.params).toMatchObject({ calendar: { sequence: 1 } });
    const transport = new FakeTransport();
    await drain(transport);
    const file = transport.sent.find((mail) => mail.to === "marta1@nordvik-cold.example")?.attachments?.[0];
    const ics = Buffer.from(file?.contentBase64 ?? "", "base64").toString("utf8");
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("SEQUENCE:1");
    expect(ics).toContain("STATUS:CANCELLED");
  });

  it("emails a cancellation when Fynix closes a lead with a booked meeting, and says nothing to the prospect of a lead that never had a time", async () => {
    emailsOn();
    await prospectEmailOn();
    const one = await booked();
    await clearMail();
    await fynixMarkLost(rig.deps(), rig.actor, { leadId: one.leadId, note: "Closed by Fynix after a call" });
    expect(await whoGot("prospect_cancelled")).toEqual(["marta1@nordvik-cold.example"]);
    expect(await whoGot("meeting_cancelled")).toEqual(ids(cast.coordinator, cast.coordinatorColleague, cast.clientActor, cast.clientColleague, cast.fynixStaff));
    await clearMail();
    const unbooked = await sent();
    await clearMail();
    await fynixMarkLost(rig.deps(), rig.actor, { leadId: unbooked.leadId, note: "Closed by Fynix after a call" });
    expect(await mails()).toEqual([]);
  });

  it("emails the cancellation when an agency withdraws a lead whose meeting is booked: the cancelled letter with a CANCEL file and a raised sequence, and the people who work the lead except the one who withdrew it", async () => {
    emailsOn();
    await prospectEmailOn();
    const one = await booked("partner");
    await clearMail();
    await withdrawLead(agencyDb(), rig.deps(), cast.partner, { leadId: one.leadId, note: "The prospect asked us to stop" });
    expect((await meetingRow(one.meetingId)).outcome).toBe("cancelled");
    expect(await whoGot("prospect_cancelled")).toEqual(["marta1@nordvik-cold.example"]);
    expect(await whoGot("meeting_cancelled")).toEqual(ids(cast.coordinator, cast.coordinatorColleague, cast.clientActor, cast.clientColleague, ...fynixPeople()));
    expect((await mails("meeting_cancelled")).every((row) => row.params.reason === "withdrawn" && row.params.note === undefined)).toBe(true);
    const transport = new FakeTransport();
    await drain(transport);
    const ics = Buffer.from(transport.sent.find((mail) => mail.to === "marta1@nordvik-cold.example")?.attachments?.[0]?.contentBase64 ?? "", "base64").toString("utf8");
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("SEQUENCE:1");
  });

  it("when Fynix picks the time for the client the same emails go, and the person who acted (Fynix) is left out", async () => {
    emailsOn();
    const one = await sent();
    await clearMail();
    await fynixAnswerForClient(rig.deps(), rig.actor, { leadId: one.leadId, answer: "pick_time", selectedMeetingTime: one.time, note: "The client asked us to pick" });
    expect(await whoGot("meeting_booked")).toEqual(ids(cast.coordinator, cast.coordinatorColleague, cast.clientActor, cast.clientColleague, cast.fynixStaff));
  });
});

describe("the outcome and the decision", () => {
  it("asks the client to accept or reject, tells the others, and leaves out the person who recorded it", async () => {
    emailsOn();
    const one = await booked();
    await clearMail();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, outcome: "held" });
    expect(await whoGot("outcome_held_client")).toEqual(ids(cast.clientActor, cast.clientColleague));
    expect(await whoGot("outcome_held_info")).toEqual(ids(cast.coordinatorColleague, ...fynixPeople()));
  });

  it("tells the supply side and Fynix of a no-show, with no question to the client, and tells the client's people when the no-show is theirs", async () => {
    emailsOn();
    const one = await booked();
    await clearMail();
    await fynixRecordMeetingOutcome(fynixDb(), rig.deps(), rig.actor, { meetingId: one.meetingId, outcome: "client_no_show" });
    expect(await whoGot("no_show_info")).toEqual(ids(cast.coordinator, cast.coordinatorColleague, cast.fynixStaff));
    expect(await whoGot("outcome_held_client")).toEqual([]);
    expect(await whoGot("client_no_show_client")).toEqual(ids(cast.clientActor, cast.clientColleague));
    await clearMail();
    const two = await booked();
    await clearMail();
    await recordMeetingOutcome(clientDb(), rig.deps(), cast.clientActor, { meetingId: two.meetingId, outcome: "prospect_no_show" });
    expect((await mails("no_show_info")).map((row) => row.params.outcome)).toEqual(["prospect_no_show", "prospect_no_show", "prospect_no_show", "prospect_no_show"]);
    expect(await whoGot("client_no_show_client")).toEqual([]);
  });

  it("tells the supply side and Fynix of an acceptance, of a rejection with the client's note scrubbed, and tells the coordinators of a rejection Fynix changed", async () => {
    emailsOn();
    const accepted = await booked();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: accepted.meetingId, outcome: "held" });
    await clearMail();
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: accepted.leadId, decision: "accept", note: "A strong fit for us" });
    expect(await whoGot("lead_accepted_info")).toEqual(ids(cast.coordinator, cast.coordinatorColleague, ...fynixPeople()));

    const rejected = await booked();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: rejected.meetingId, outcome: "held" });
    await clearMail();
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: rejected.leadId, decision: "reject", note: `Call Marta on ${PROSPECT_PHONE} or write to marta2@nordvik-cold.example, not a fit` });
    expect(await whoGot("lead_rejected_info")).toEqual(ids(cast.coordinator, cast.coordinatorColleague, ...fynixPeople()));
    const [row] = await mails("lead_rejected_info");
    expect(row?.params).toMatchObject({ noteFrom: "Client" });
    expect(String(row?.params.note)).toContain("not a fit");
    expect(JSON.stringify(row?.params)).not.toMatch(/7911|marta2@/);
    await clearMail();
    await fynixOverturnRejection(fynixDb(), rig.deps(), rig.actor, { leadId: rejected.leadId, note: "The brief says logistics" });
    expect(await whoGot("rejection_overturned_info")).toEqual(ids(cast.coordinator, cast.coordinatorColleague));
    // The client's people read Fynix's note too: the lead now counts toward their number.
    expect(await whoGot("rejection_overturned_client")).toEqual(ids(cast.clientActor, cast.clientColleague));
    expect((await mails("rejection_overturned_client"))[0]?.params).toMatchObject({ note: "The brief says logistics", noteFrom: "Fynix" });
  });
});

describe("new times, contests and reviews", () => {
  it("emails a proposal of new times to the side that picks and to Fynix, never to the side that proposed", async () => {
    emailsOn();
    const one = await booked();
    await clearMail();
    await proposePostponement(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, proposedTimes: [nextWeekdayAt(11, 6)] });
    expect(await whoGot("postponement_proposed_info")).toEqual(ids(cast.clientActor, cast.clientColleague, ...fynixPeople()));
    expect((await mails("postponement_proposed_info")).every((row) => row.params.proposedBy === "supply")).toBe(true);

    const two = await booked();
    await clearMail();
    await proposePostponement(clientDb(), rig.deps(), cast.clientActor, { meetingId: two.meetingId, proposedTimes: [nextWeekdayAt(11, 7)] });
    expect(await whoGot("postponement_proposed_info")).toEqual(ids(cast.coordinator, cast.coordinatorColleague, ...fynixPeople()));
    expect((await mails("postponement_proposed_info")).every((row) => row.params.proposedBy === "client")).toBe(true);
  });

  it("emails a contested outcome and Fynix's decision to all four sides, the note scrubbed and labelled, and never to the person who acted", async () => {
    emailsOn();
    const one = await booked();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, outcome: "client_no_show" });
    await clearMail();
    await contestOutcome(clientDb(), rig.deps(), cast.clientActor, { meetingId: one.meetingId, note: `We did join, call me on ${PROSPECT_PHONE}` });
    expect(await whoGot("outcome_contested_info")).toEqual(ids(cast.clientColleague, cast.coordinator, cast.coordinatorColleague, ...fynixPeople()));
    const [contested] = await mails("outcome_contested_info");
    expect(contested?.params).toMatchObject({ noteFrom: "Client" });
    expect(String(contested?.params.note)).toContain("We did join");
    expect(JSON.stringify(contested?.params)).not.toContain("7911");

    await clearMail();
    await fynixDecideContest(rig.deps(), rig.actor, one.leadId, "held", "The room record shows the client joined");
    expect(await whoGot("contest_decided_info")).toEqual(ids(cast.clientActor, cast.clientColleague, cast.coordinator, cast.coordinatorColleague, cast.fynixStaff));
    expect((await mails("contest_decided_info"))[0]?.params).toMatchObject({ decided: "held", noteFrom: "Fynix", note: "The room record shows the client joined" });
  });

  it("emails Fynix alone when the coordinator asks for a review of a rejection", async () => {
    emailsOn();
    const one = await booked();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, outcome: "held" });
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, decision: "reject", note: "Wrong industry" });
    await clearMail();
    await requestRejectionReview(agencyDb(), rig.deps(), cast.coordinator, { leadId: one.leadId, note: "They fit the brief" });
    expect(await whoGot("review_requested_info")).toEqual(ids(...fynixPeople()));
  });

  it("is accepted by the queue for every launch template of the enum, and the three account emails are still refused", async () => {
    emailsOn();
    const one = await sent();
    await clearMail();
    const call = (template: string) => asTenant(agencyDb(), cast.coordinator, (tx) => tx.execute(sql`select public.app_enqueue_lead_email(${one.leadId}::uuid, '{fynix}'::text[], ${template}, '{}'::jsonb, 's', 'b', ${ORIGIN})`));
    await call("review_requested_info");
    expect(await whoGot("review_requested_info")).toEqual(ids(...fynixPeople()));
    await denied(call("alias_code"), /domain:invalid-input/);
    await denied(call("not_a_template"), /domain:invalid-input/);
  });
});

describe("the sweep: reminders, nudges and the 48 hours", () => {
  const enqueue = () => ({ enabled: true, origin: ORIGIN });

  it("emails the client every 12 hours with the time left, a final warning at 36, once each, and the notice in the app is unaffected", async () => {
    emailsOn();
    const one = await booked();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, outcome: "held" });
    await clearMail();
    const at = (await ownerDb().select({ at: lead.outcomeRecordedAt }).from(lead).where(eq(lead.id, one.leadId)))[0]?.at ?? new Date();
    expect(await sendReminderEmails(authDb(), hours(at, 11), enqueue())).toBe(0);
    const first = hours(at, 12.05);
    expect(await sendReminderEmails(authDb(), first, enqueue())).toBe(1);
    expect(await whoGot("decision_reminder")).toEqual(ids(cast.clientActor, cast.clientColleague));
    expect((await mails("decision_reminder"))[0]?.params).toMatchObject({ hoursLeft: 36 });
    expect(await sendReminderEmails(authDb(), hours(at, 12.5), enqueue())).toBe(0);
    // The notice in the app has its own stamp, so it is still due.
    expect(await sendLeadReminders({ authDb: authDb() }, first)).toHaveLength(1);
    expect(await ownerDb().select({ kind: leadReminder.kind, sent: leadReminder.sentAt, emailSent: leadReminder.emailSentAt }).from(leadReminder).where(and(eq(leadReminder.leadId, one.leadId), eq(leadReminder.kind, "12h")))).toEqual([{ kind: "12h", sent: first, emailSent: first }]);
    expect(await sendReminderEmails(authDb(), hours(at, 24.05), enqueue())).toBe(1);
    expect(await sendReminderEmails(authDb(), hours(at, 36.05), enqueue())).toBe(1);
    const sentHours = (await mails("decision_reminder")).map((row) => row.params.hoursLeft);
    expect(sentHours.filter((value) => value === 36)).toHaveLength(2);
    expect(sentHours.filter((value) => value === 24)).toHaveLength(2);
    expect(sentHours.filter((value) => value === 12)).toHaveLength(2);
    expect((await mails("decision_reminder")).map((row) => row.subject)).toEqual([
      `Reminder: accept or reject lead ${one.publicRef}`,
      `Reminder: accept or reject lead ${one.publicRef}`,
      `Reminder: accept or reject lead ${one.publicRef}`,
      `Reminder: accept or reject lead ${one.publicRef}`,
      `Final reminder: lead ${one.publicRef} is accepted automatically in 12 hours`,
      `Final reminder: lead ${one.publicRef} is accepted automatically in 12 hours`,
    ]);
  });

  it("stops the reminders when the client answers", async () => {
    emailsOn();
    const one = await booked();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, outcome: "held" });
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, decision: "accept", note: "Yes please" });
    await clearMail();
    const at = (await ownerDb().select({ at: lead.outcomeRecordedAt }).from(lead).where(eq(lead.id, one.leadId)))[0]?.at ?? new Date();
    expect(await sendReminderEmails(authDb(), hours(at, 40), enqueue())).toBe(0);
    expect(await mails()).toEqual([]);
  });

  it("emails the supply side and Fynix when a lead is accepted after 48 hours, and only when the switch is on", async () => {
    emailsOn();
    const one = await booked();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, outcome: "held" });
    await clearMail();
    const at = (await ownerDb().select({ at: lead.outcomeRecordedAt }).from(lead).where(eq(lead.id, one.leadId)))[0]?.at ?? new Date();
    const swept = await sweepLeadsWithEmails(authDb(), hours(at, 49), enqueue());
    expect(swept.map((row) => row.publicRef)).toEqual([one.publicRef]);
    expect(await whoGot("lead_auto_accepted_info")).toEqual(ids(cast.coordinator, cast.coordinatorColleague, ...fynixPeople()));
    expect(await whoGot("lead_auto_accepted_client")).toEqual(ids(cast.clientActor, cast.clientColleague));
    expect((await sweepLeadsWithEmails(authDb(), hours(at, 50), enqueue())).length).toBe(0);
  });

  it("emails the prospect a day and an hour before, once each, in the right order, and the supply side a nudge when it ends and a day later", async () => {
    emailsOn();
    await prospectEmailOn();
    const one = await booked();
    const start = (await meetingRow(one.meetingId)).start;
    await clearMail();
    expect(await sendMeetingReminderEmails(authDb(), hours(start, -25), enqueue())).toEqual({ prospect: 0, nudges: 0 });
    expect(await sendMeetingReminderEmails(authDb(), hours(start, -23.9), enqueue())).toEqual({ prospect: 1, nudges: 0 });
    expect(await sendMeetingReminderEmails(authDb(), hours(start, -23.5), enqueue())).toEqual({ prospect: 0, nudges: 0 });
    expect(await sendMeetingReminderEmails(authDb(), hours(start, -0.9), enqueue())).toEqual({ prospect: 1, nudges: 0 });
    expect((await mails()).map((row) => row.template)).toEqual(["prospect_reminder_24h", "prospect_reminder_1h"]);
    expect((await mails("prospect_reminder_1h"))[0]).toMatchObject({ recipient: "marta1@nordvik-cold.example", link: null, senderName: "Lena Hartmann" });
    expect(await sendMeetingReminderEmails(authDb(), hours(start, 0.6), enqueue())).toEqual({ prospect: 0, nudges: 1 });
    expect(await whoGot("outcome_nudge")).toEqual(ids(cast.coordinator, cast.coordinatorColleague, ...fynixPeople()));
    expect(await sendMeetingReminderEmails(authDb(), hours(start, 24.6), enqueue())).toEqual({ prospect: 0, nudges: 1 });
    expect(await sendMeetingReminderEmails(authDb(), hours(start, 30), enqueue())).toEqual({ prospect: 0, nudges: 0 });
  });

  it("sends no reminder for a meeting booked too close to its time, or whose outcome is already in, and none for a meeting that is cancelled", async () => {
    emailsOn();
    await prospectEmailOn();
    const soon = await booked();
    await ownerDb().update(meeting).set({ scheduledStartTime: hours(new Date(), 3) }).where(eq(meeting.id, soon.meetingId));
    await clearMail();
    const now = new Date();
    // A day before was due 21 hours ago: stamped, never sent. An hour before is due in two hours.
    expect(await sendMeetingReminderEmails(authDb(), now, enqueue())).toEqual({ prospect: 0, nudges: 0 });
    expect(await sendMeetingReminderEmails(authDb(), hours(now, 2.05), enqueue())).toEqual({ prospect: 1, nudges: 0 });
    expect(await sendMeetingReminderEmails(authDb(), hours(now, 5), enqueue())).toEqual({ prospect: 0, nudges: 1 });
    await ownerDb().delete(meetingReminder).where(eq(meetingReminder.meetingId, soon.meetingId));

    const held = await booked();
    const heldStart = (await meetingRow(held.meetingId)).start;
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: held.meetingId, outcome: "held" });
    await clearMail();
    expect(await sendMeetingReminderEmails(authDb(), hours(heldStart, 1), enqueue())).toEqual({ prospect: 0, nudges: 0 });

    const lost = await booked();
    const lostStart = (await meetingRow(lost.meetingId)).start;
    await fynixMarkLost(rig.deps(), rig.actor, { leadId: lost.leadId, note: "Closed by Fynix after a call" });
    await clearMail();
    expect(await sendMeetingReminderEmails(authDb(), hours(lostStart, -23.9), enqueue())).toEqual({ prospect: 0, nudges: 0 });
  });

  it("moves the reminders with a postponement and arms the ones already sent again", async () => {
    emailsOn();
    await prospectEmailOn();
    const one = await booked();
    const start = (await meetingRow(one.meetingId)).start;
    expect(await sendMeetingReminderEmails(authDb(), hours(start, -23.9), enqueue())).toMatchObject({ prospect: 1 });
    const later = nextWeekdayAt(11, 9);
    await proposePostponement(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, proposedTimes: [later] });
    const [proposal] = await asTenant(clientDb(), cast.clientActor, (tx) => tx.execute<{ id: string }>(sql`select id from meeting_reschedule where meeting_id = ${one.meetingId}::uuid`)).then((result) => result.rows);
    await pickPostponement(clientDb(), rig.deps(), cast.clientActor, { rescheduleId: proposal?.id, pickedTime: later });
    const rows = await ownerDb().select({ kind: meetingReminder.kind, due: meetingReminder.dueAt, sent: meetingReminder.sentAt }).from(meetingReminder).where(eq(meetingReminder.meetingId, one.meetingId));
    expect(rows.find((row) => row.kind === "prospect_24h")).toEqual({ kind: "prospect_24h", due: hours(later, -24), sent: null });
    expect(rows.find((row) => row.kind === "nudge_end")).toEqual({ kind: "nudge_end", due: hours(later, 0.5), sent: null });
    await clearMail();
    expect(await sendMeetingReminderEmails(authDb(), hours(later, -23.9), enqueue())).toMatchObject({ prospect: 1 });
    expect((await mails("prospect_reminder_24h"))[0]?.params).toMatchObject({ when: expect.stringContaining("Europe/London") });
  });
});

describe("the privacy link and the prospect email switch", () => {
  it("is Fynix admin's to set: https only, audited without the address, and switching on needs a link", async () => {
    expect((await refusal(setProspectEmail(rig.deps(), rig.actor, cast.campaignId, true))).code).toBe("privacy-link-missing");
    for (const url of ["http://privacy.example/policy", "ftp://privacy.example", "javascript:alert(1)", "not a link", "https://user:pw@privacy.example/p", "https://localhost/p", `https://privacy.example/${"a".repeat(500)}`]) {
      expect((await refusal(setCampaignPrivacy(rig.deps(), rig.actor, cast.campaignId, url))).code, url).toBe("invalid-input");
    }
    expect(await setCampaignPrivacy(rig.deps(), rig.actor, cast.campaignId, `  ${PRIVACY}  `)).toMatchObject({ clientPrivacyUrl: PRIVACY, prospectEmailEnabled: false });
    expect(await setProspectEmail(rig.deps(), rig.actor, cast.campaignId, true)).toMatchObject({ prospectEmailEnabled: true });
    // Taking the link away takes the switch with it.
    expect(await setCampaignPrivacy(rig.deps(), rig.actor, cast.campaignId, null)).toMatchObject({ clientPrivacyUrl: null, prospectEmailEnabled: false });
    const rows = await ownerDb().select({ action: auditLog.action, before: auditLog.before, after: auditLog.after }).from(auditLog).where(sql`${auditLog.action} in ('campaign.set_privacy', 'campaign.set_prospect_email')`);
    expect(rows.map((row) => row.action)).toEqual(["campaign.set_privacy", "campaign.set_prospect_email", "campaign.set_privacy"]);
    expect(JSON.stringify(rows)).not.toContain("https://");
    expect(JSON.stringify(rows)).toContain("privacy.kestrel-logistics.example");
  });

  it("is refused to Fynix staff, and by the database to anyone who writes the columns another way", async () => {
    const staff = { userId: cast.fynixStaff, orgKind: "fynix" as const, role: "member" as const };
    expect((await refusal(setCampaignPrivacy(rig.deps(), staff as never, cast.campaignId, PRIVACY))).code).toBe("admin-required");
    await denied(ownerDb().execute(sql`update campaign set prospect_email_enabled = true where id = ${cast.campaignId}::uuid`), /campaign_prospect_email_needs_privacy_url/);
    await denied(ownerDb().execute(sql`update campaign set client_privacy_url = 'http://x.example/p' where id = ${cast.campaignId}::uuid`), /campaign_privacy_url_https/);
    for (const [db, actor] of [[clientDb(), cast.clientActor], [agencyDb(), cast.coordinator]] as const) {
      await denied(asTenant(db, actor, (tx) => tx.execute(sql`update campaign set client_privacy_url = 'https://x.example/p' where id = ${cast.campaignId}::uuid`)), /permission denied for table campaign/);
      await denied(asTenant(db, actor, (tx) => tx.execute(sql`update campaign set prospect_email_enabled = true where id = ${cast.campaignId}::uuid`)), /permission denied for table campaign/);
    }
  });

  it("is read by the client of the campaign and by no agency", async () => {
    await prospectEmailOn();
    const [seen] = await asTenant(clientDb(), cast.clientActor, (tx) => tx.select({ url: clientCampaignColumns.clientPrivacyUrl, on: clientCampaignColumns.prospectEmailEnabled }).from(campaign).where(eq(campaign.id, cast.campaignId)));
    expect(seen).toEqual({ url: PRIVACY, on: true });
    await denied(asTenant(agencyDb(), cast.coordinator, (tx) => tx.execute(sql`select client_privacy_url from campaign`)), /permission denied for table campaign/);
    await denied(asTenant(agencyDb(), cast.coordinator, (tx) => tx.execute(sql`select prospect_email_enabled from campaign`)), /permission denied for table campaign/);
  });

  it("is not in anything an agency can read through the database functions: the context says only whether a letter can be written", async () => {
    emailsOn();
    await prospectEmailOn();
    const one = await sent();
    const context = await asTenant(agencyDb(), cast.coordinator, (tx) => tx.execute(sql`select * from public.app_lead_email_context(${one.leadId}::uuid)`));
    expect(Object.keys(context.rows[0] ?? {}).sort()).toEqual(["company", "duration_minutes", "ics_sequence", "lead_ref", "meet_url", "meeting_id", "meeting_outcome", "meeting_ref", "prospect_ready", "starts_at", "time_zone"]);
    expect(JSON.stringify(context.rows)).not.toMatch(/privacy|marta|lena@/);
    expect(context.rows[0]).toMatchObject({ prospect_ready: true });
  });
});

describe("the opening paragraph of a campaign's letter", () => {
  const OPENING = "We help cold chain teams cut spoilage, and I thought a short call would be useful.";
  const paramsOf = async (template: string) => (await mails(template))[0]?.params ?? {};

  it("is a Fynix admin's to write and remove: tidied into one paragraph, audited, and read back for the campaign page", async () => {
    expect(await setProspectLetterOpening(rig.deps(), rig.actor, cast.campaignId, "  We help   cold chain teams.\n\nA short call would be useful.  ")).toMatchObject({ prospectLetterOpening: "We help cold chain teams. A short call would be useful." });
    const [{ ref } = { ref: "" }] = await ownerDb().select({ ref: campaign.publicRef }).from(campaign).where(eq(campaign.id, cast.campaignId));
    expect(await readCampaignPrivacy(rig.deps(), rig.actor, ref)).toMatchObject({ prospectLetterOpening: "We help cold chain teams. A short call would be useful." });
    expect(await setProspectLetterOpening(rig.deps(), rig.actor, cast.campaignId, null)).toMatchObject({ prospectLetterOpening: null });
    const rows = await ownerDb().select({ action: auditLog.action, before: auditLog.before, after: auditLog.after }).from(auditLog).where(eq(auditLog.action, "campaign.set_letter_opening"));
    expect(rows).toHaveLength(2);
    expect(rows[0]?.after).toEqual({ letterOpening: "We help cold chain teams. A short call would be useful." });
    expect(rows[1]).toMatchObject({ before: { letterOpening: "We help cold chain teams. A short call would be useful." }, after: { letterOpening: null } });
  });

  it("refuses a paragraph that breaks a rule of the letter, and one that names the coordinator or an agency of the campaign", async () => {
    for (const bad of ["", "   ", "A word from Fynix.", "See https://elsewhere.example/page first.", "Write to me at anna@elsewhere.example.", "x".repeat(601)]) {
      expect((await refusal(setProspectLetterOpening(rig.deps(), rig.actor, cast.campaignId, bad))).code, bad.slice(0, 30)).toBe("invalid-input");
    }
    const [{ name: coordinatorName } = { name: "" }] = await ownerDb().execute<{ name: string }>(sql`select name from organisation where id = ${cast.coordinator.orgId}::uuid`).then((result) => result.rows);
    expect((await refusal(setProspectLetterOpening(rig.deps(), rig.actor, cast.campaignId, `Sent for you by ${coordinatorName.toUpperCase()}.`))).code).toBe("letter-names-supply-side");
    expect((await refusal(setProspectLetterOpening(rig.deps(), rig.actor, cast.campaignId, "Our friends at ridgeway partner ltd suggested we talk."))).code).toBe("letter-names-supply-side");
    expect(await ownerDb().select({ id: auditLog.id }).from(auditLog).where(eq(auditLog.action, "campaign.set_letter_opening"))).toEqual([]);
  });

  it("is refused to Fynix staff, and no client or agency reads or writes it", async () => {
    const staff = { userId: cast.fynixStaff, orgKind: "fynix" as const, role: "member" as const };
    expect((await refusal(setProspectLetterOpening(rig.deps(), staff as never, cast.campaignId, OPENING))).code).toBe("admin-required");
    await denied(ownerDb().execute(sql`update campaign set prospect_letter_opening = ${"x".repeat(601)} where id = ${cast.campaignId}::uuid`), /campaign_letter_opening_length/);
    for (const [db, actor] of [[clientDb(), cast.clientActor], [agencyDb(), cast.coordinator]] as const) {
      await denied(asTenant(db, actor, (tx) => tx.execute(sql`select prospect_letter_opening from campaign`)), /permission denied for table campaign/);
      await denied(asTenant(db, actor, (tx) => tx.execute(sql`update campaign set prospect_letter_opening = 'x' where id = ${cast.campaignId}::uuid`)), /permission denied for table campaign/);
      await denied(asTenant(db, actor, (tx) => tx.execute(sql`select public.app_prospect_letter_opening(gen_random_uuid(), 'prospect_confirmed')`)), /permission denied for function app_prospect_letter_opening/);
    }
  });

  it("goes into the confirmation letter and no other letter, and the prospect reads it in place of the default first sentence", async () => {
    emailsOn();
    await prospectEmailOn();
    await setProspectLetterOpening(rig.deps(), rig.actor, cast.campaignId, OPENING);
    const one = await booked();
    expect(await paramsOf("prospect_confirmed")).toMatchObject({ letterOpening: OPENING });
    const transport = new FakeTransport();
    expect((await drain(transport)).failed).toBe(0);
    const letter = transport.sent.find((mail) => mail.to === "marta1@nordvik-cold.example");
    expect(letter?.text).toContain(OPENING);
    expect(letter?.text).not.toContain("Thank you for agreeing to talk.");
    expect(letter?.text).toContain("Your meeting is confirmed for");
    await clearMail();
    await proposePostponement(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, proposedTimes: [nextWeekdayAt(11, 6)] });
    const [proposal] = await asTenant(clientDb(), cast.clientActor, (tx) => tx.execute<{ id: string }>(sql`select id from meeting_reschedule where meeting_id = ${one.meetingId}::uuid`)).then((result) => result.rows);
    await pickPostponement(clientDb(), rig.deps(), cast.clientActor, { rescheduleId: proposal?.id, pickedTime: nextWeekdayAt(11, 6) });
    expect(await paramsOf("prospect_moved")).not.toHaveProperty("letterOpening");
  });

  it("is left out, and the default letter goes, when it names an agency that joined the campaign after it was written", async () => {
    emailsOn();
    await prospectEmailOn();
    const text = "Larkfield Outreach and others told us you are the person to ask.";
    await setProspectLetterOpening(rig.deps(), rig.actor, cast.campaignId, text);
    await booked();
    expect(await paramsOf("prospect_confirmed")).toMatchObject({ letterOpening: text });
    await clearMail();
    // A new partner agency of that name takes a share: its name is now one a prospect must never read.
    const late = await createPartnerAgency(rig.deps(), rig.actor, { coordinatorId: cast.coordinator.orgId, name: "Larkfield Outreach" });
    await ownerDb().insert(campaignShare).values({ campaignId: cast.campaignId, agencyOrgId: late.id, monthlyShare: 1 });
    await booked();
    expect(await paramsOf("prospect_confirmed")).not.toHaveProperty("letterOpening");
    const transport = new FakeTransport();
    expect((await drain(transport)).failed).toBe(0);
    expect(transport.sent.find((mail) => /is confirmed/.test(mail.subject) && mail.to.startsWith("marta"))?.text).toContain("Thank you for agreeing to talk.");
  });
});

describe("targets, shares, agreements and leads left waiting", () => {
  const on = () => ({ enabled: true, origin: ORIGIN });
  /** The campaign's two targets and the coordinator's own share, set the way a published agreement and a share would leave them. */
  async function numbers(monthly: number, total: number, coordinatorShare: number): Promise<void> {
    await ownerDb().update(campaign).set({ monthlyTarget: monthly, totalTarget: total }).where(eq(campaign.id, cast.campaignId));
    await ownerDb().update(campaignShare).set({ monthlyShare: coordinatorShare }).where(and(eq(campaignShare.campaignId, cast.campaignId), eq(campaignShare.agencyOrgId, cast.coordinator.orgId)));
  }
  /** A lead the client accepted after its meeting: it counts as one. */
  async function accepted() {
    const one = await booked();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, outcome: "held" });
    await decideLead(clientDb(), rig.deps(), cast.clientActor, { leadId: one.leadId, decision: "accept", note: "A strong fit for us" });
    return one;
  }
  const notices = async (like: string) => (await ownerDb().select({ userId: notification.userId, title: notification.title, body: notification.body, link: notification.link }).from(notification).where(sql`${notification.title} like ${like}`)).sort((a, b) => a.userId.localeCompare(b.userId));
  const everyone = () => ids(cast.clientActor, cast.clientColleague, cast.coordinator, cast.coordinatorColleague, ...fynixPeople());

  it("keeps the database's list of the stages that count equal to the rule in the code", async () => {
    const [row] = (await ownerDb().execute<{ stages: string[] }>(sql`select public.app_counted_stages() as stages`)).rows;
    expect([...(row?.stages ?? [])].sort()).toEqual([...COUNTED_STAGES].sort());
  });

  it("says an agency's share to that agency, then the month's target and the total to the client, the coordinator and Fynix, each once", async () => {
    emailsOn();
    await numbers(2, 3, 1);
    await accepted();
    // One lead counts: the coordinator sent it and its share is one. The campaign's target of two is not met.
    expect(await whoGot("share_met_info")).toEqual(ids(cast.coordinator, cast.coordinatorColleague));
    expect((await mails("share_met_info"))[0]?.params).toMatchObject({ reached: 1, target: 1 });
    expect(await whoGot("target_met_info")).toEqual([]);
    expect((await notices("You reached your share for %")).map((row) => row.userId)).toEqual(ids(cast.coordinator, cast.coordinatorColleague));

    await clearMail();
    await accepted();
    // Two count: the month's target. The person who accepted is not emailed; the notice in the app is for everyone, the person who acted included.
    expect(await whoGot("target_met_info")).toEqual(ids(cast.clientColleague, cast.coordinator, cast.coordinatorColleague, ...fynixPeople()));
    expect((await mails("target_met_info"))[0]?.params).toMatchObject({ scope: "month", reached: 2, target: 2 });
    expect(String((await mails("target_met_info"))[0]?.params.period)).toMatch(/^[A-Z][a-z]+ \d{4}$/);
    expect(await whoGot("share_met_info")).toEqual([]);
    const monthly = await notices("% reached its target for %");
    expect(monthly.map((row) => row.userId)).toEqual(everyone());
    expect(monthly[0]?.body).toMatch(/^2 leads now count for [A-Z][a-z]+ \d{4}\. The target is 2\. Lead LD-[0-9A-Z]{4} completed it\.$/);

    await clearMail();
    await accepted();
    // Three count: the total. The month's target is not said a second time.
    const total = await mails("target_met_info");
    expect(total.every((row) => row.params.scope === "total" && row.params.reached === 3 && row.params.target === 3)).toBe(true);
    expect(total).toHaveLength(5);
    expect(await notices("% reached its target for %")).toHaveLength(6);
    expect((await notices("% reached its total target")).map((row) => row.userId)).toEqual(everyone());
    expect([...monthly, ...(await notices("% reached its total target"))].map((row) => `${row.title} ${row.body}`).join(" ")).not.toMatch(/[\u2013\u2014!]/);
  });

  it("counts a client no-show, and says a target once even when the count falls after a contest and is met again", async () => {
    emailsOn();
    await numbers(1, 0, 0);
    const one = await booked();
    await clearMail();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, outcome: "client_no_show" });
    expect(await whoGot("target_met_info")).toEqual(ids(cast.clientActor, cast.clientColleague, cast.coordinatorColleague, ...fynixPeople()));
    // The client contests and Fynix finds the prospect did not come: the lead counts zero again.
    await contestOutcome(clientDb(), rig.deps(), cast.clientActor, { meetingId: one.meetingId, note: "We did join the call" });
    await fynixDecideContest(rig.deps(), rig.actor, one.leadId, "prospect_no_show", "The room record shows the client alone");
    await clearMail();
    await accepted();
    expect(await mails("target_met_info")).toEqual([]);
    expect(await notices("% reached its target for %")).toHaveLength(6);
  });

  it("never meets a target or a share of zero, and with the switch off still writes the notice and no email", async () => {
    await numbers(0, 0, 0);
    await accepted();
    expect(await notices("% reached its %")).toEqual([]);
    expect(await notices("You reached your share for %")).toEqual([]);
    await numbers(2, 0, 0);
    await accepted();
    expect((await notices("% reached its target for %")).map((row) => row.userId)).toEqual(everyone());
    expect(await mails()).toEqual([]);
  });

  it("says the target an automatic acceptance completes, from the sweep, to everyone", async () => {
    emailsOn();
    await numbers(1, 0, 0);
    const one = await booked();
    await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: one.meetingId, outcome: "held" });
    await clearMail();
    const at = (await ownerDb().select({ at: lead.outcomeRecordedAt }).from(lead).where(eq(lead.id, one.leadId)))[0]?.at ?? new Date();
    await sweepLeadsWithEmails(authDb(), hours(at, 49), on());
    expect(await whoGot("target_met_info")).toEqual(everyone());
    expect((await sweepLeadsWithEmails(authDb(), hours(at, 50), on())).length).toBe(0);
    expect(await mails("target_met_info")).toHaveLength(6);
  });

  it("counts a lead in the month of its meeting read in the campaign's zone, and a mistyped zone stops nothing", async () => {
    await numbers(2, 0, 0);
    const first = await booked();
    const second = await booked();
    // 30 November 10:00 and 12:00 UTC are 30 November 23:00 and 1 December 01:00 in Auckland: two months there, one month in London.
    await ownerDb().update(lead).set({ stage: "accepted", scheduledMeetingTime: new Date("2026-11-30T10:00:00.000Z") }).where(eq(lead.id, first.leadId));
    await ownerDb().update(lead).set({ stage: "accepted", scheduledMeetingTime: new Date("2026-11-30T12:00:00.000Z") }).where(eq(lead.id, second.leadId));
    const claim = async () => (await authDb().execute<{ scope: string; period: string; reached: number }>(sql`select scope, period, reached from public.app_claim_target_notices_system(${second.leadId}::uuid)`)).rows;
    await ownerDb().update(campaign).set({ timeZone: "Pacific/Auckland" }).where(eq(campaign.id, cast.campaignId));
    expect(await claim()).toEqual([]);
    await ownerDb().update(campaign).set({ timeZone: "Not/AZone" }).where(eq(campaign.id, cast.campaignId));
    expect(await claim()).toEqual([{ scope: "campaign_month", period: "November 2026", reached: 2 }]);
    expect(await claim()).toEqual([]);
  });

  it("tells Fynix alone, in the app and by email, when a lead takes its sender past its share", async () => {
    emailsOn();
    await numbers(12, 72, 1);
    await sent();
    expect(await mails("over_share_info")).toEqual([]);
    await clearMail();
    const over = await sent();
    expect(await whoGot("over_share_info")).toEqual(ids(...fynixPeople()));
    expect((await mails("over_share_info"))[0]?.link).toBe(`${ORIGIN}/fynix/leads/${over.publicRef}`);
    expect((await notices("Lead % is beyond its sender's share")).map((row) => row.userId)).toEqual(ids(...fynixPeople()));
  });

  it("emails a new agreement version to the managers of the client and of the coordinator, each with the link to the agreement, and not to Fynix or to people who are not managers", async () => {
    emailsOn();
    await clearMail();
    const published = await publishAgreement(rig.deps(), rig.actor, { campaignId: cast.campaignId, monthlyTarget: 10, totalTarget: 60 });
    expect(await whoGot("agreement_published_info")).toEqual(ids(cast.clientActor, cast.coordinator));
    const rows = await mails("agreement_published_info");
    expect(rows.map((row) => row.link).sort()).toEqual([`${ORIGIN}/client/agreement`, `${ORIGIN}/coordinator/agreement`]);
    expect(rows[0]?.params).toMatchObject({ version: published.version });
    expect(rows[0]?.subject).toMatch(new RegExp(`^Agreement version ${published.version} for .+ needs your acceptance$`));
    const transport = new FakeTransport();
    expect((await drain(transport)).failed).toBe(0);
    expect(transport.sent.find((mail) => /needs your acceptance/.test(mail.subject))?.html).toContain("Open the agreement");
  });

  it("queues no agreement email while the switch is off, and no tenant can queue one", async () => {
    await publishAgreement(rig.deps(), rig.actor, { campaignId: cast.campaignId, monthlyTarget: 10, totalTarget: 60 });
    expect(await mails()).toEqual([]);
    for (const [db, actor] of [[clientDb(), cast.clientActor], [agencyDb(), cast.coordinator]] as const) {
      await denied(asTenant(db, actor, (tx) => tx.execute(sql`select public.app_enqueue_campaign_email(${cast.campaignId}::uuid, '{client_managers}'::text[], 'agreement_published_info', '{}'::jsonb, 's', 'b', ${ORIGIN})`)), /permission denied for function app_enqueue_campaign_email/);
    }
  });

  describe("leads left waiting for a time", () => {
    /** Noon UTC two days from now: more than 24 hours after any lead sent in the test, and past 9 am in London, summer or winter. */
    const noonInTwoDays = (): Date => {
      const date = new Date(Date.now() + 2 * 86_400_000);
      date.setUTCHours(12, 0, 0, 0);
      return date;
    };
    const earlyInTwoDays = (): Date => new Date(noonInTwoDays().getTime() - 5 * 3_600_000);
    const clientName = async (): Promise<string> => (await ownerDb().select({ name: organisation.name }).from(organisation).where(eq(organisation.id, cast.clientActor.orgId)))[0]?.name ?? "";

    it("reminds the client once a day from 9 am there, in the app and by email, and sends Fynix one summary", async () => {
      emailsOn();
      await ownerDb().update(organisation).set({ timeZone: "Europe/London" }).where(eq(organisation.id, cast.clientActor.orgId));
      const first = await sent();
      // The second lead changed a second later, so the first is the one that has waited longest.
      const second = await sent();
      await ownerDb().execute(sql`update lead set updated_at = updated_at + interval '1 second' where id = ${second.leadId}::uuid`);
      await clearMail();
      // Seven in the morning in London: too early for anyone.
      expect(await sendWaitingReminders(authDb(), earlyInTwoDays(), on())).toEqual({ clients: 0, summary: 0 });
      expect(await sendWaitingReminders(authDb(), noonInTwoDays(), on())).toEqual({ clients: 1, summary: 1 });
      expect(await whoGot("leads_waiting_daily")).toEqual(ids(cast.clientActor, cast.clientColleague));
      const [daily] = await mails("leads_waiting_daily");
      expect(daily?.params).toMatchObject({ waiting: 2, ref: first.publicRef });
      expect(daily?.link).toBe(`${ORIGIN}/client/leads/${first.publicRef}`);
      expect(await whoGot("leads_waiting_summary")).toEqual(ids(...fynixPeople()));
      expect((await mails("leads_waiting_summary"))[0]?.params).toMatchObject({ clients: [{ name: await clientName(), waiting: 2 }], ref: first.publicRef });
      const bell = await notices("2 leads are waiting for a time");
      expect(bell.map((row) => row.userId)).toEqual(ids(cast.clientActor, cast.clientColleague));
      expect(bell[0]?.link).toBe(`/client/leads/${first.publicRef}`);
      // A second run the same day sends nothing; the next day it does again.
      await clearMail();
      expect(await sendWaitingReminders(authDb(), hours(noonInTwoDays(), 1), on())).toEqual({ clients: 0, summary: 0 });
      expect(await mails()).toEqual([]);
      expect(await sendWaitingReminders(authDb(), hours(noonInTwoDays(), 24), on())).toEqual({ clients: 1, summary: 1 });
    });

    it("leaves out a lead that waits less than 24 hours, and one that waits for accept or reject", async () => {
      emailsOn();
      await sent();
      const held = await booked();
      await recordMeetingOutcome(agencyDb(), rig.deps(), cast.coordinator, { meetingId: held.meetingId, outcome: "held" });
      await clearMail();
      const tomorrowNoon = new Date(noonInTwoDays().getTime() - 86_400_000);
      // Less than 24 hours after the lead was sent, unless the test runs before noon UTC: then it is more, and the reminder is due.
      const due = tomorrowNoon.getTime() - Date.now() >= 24 * 3_600_000;
      expect((await sendWaitingReminders(authDb(), tomorrowNoon, on())).clients).toBe(due ? 1 : 0);
      await clearMail();
      await ownerDb().execute(sql`delete from once_stamp`);
      expect(await sendWaitingReminders(authDb(), noonInTwoDays(), on())).toEqual({ clients: 1, summary: 1 });
      expect((await mails("leads_waiting_daily"))[0]?.params).toMatchObject({ waiting: 1 });
    });

    it("uses the campaign's zone when the client's is missing or mistyped, and with the switch off writes the notice and no email and no summary", async () => {
      await ownerDb().update(organisation).set({ timeZone: "Not/AZone" }).where(eq(organisation.id, cast.clientActor.orgId));
      await sent();
      expect(await sendWaitingReminders(authDb(), noonInTwoDays(), { enabled: false })).toEqual({ clients: 1, summary: 0 });
      expect(await mails()).toEqual([]);
      expect((await notices("1 lead is waiting for a time")).map((row) => row.userId)).toEqual(ids(cast.clientActor, cast.clientColleague));
      expect((await ownerDb().execute<{ key: string }>(sql`select key from once_stamp`)).rows.every((row) => row.key.startsWith("waiting:"))).toBe(true);
    });
  });
});

describe("a tenant cannot queue mail of its own", () => {
  it("is refused a lead that is not theirs, a template that is not a launch template, an audience that is not one, a prospect letter for a staff template and the reverse", async () => {
    emailsOn();
    const one = await sent();
    const call = (actor: TenantActor, db: Database, lead: string, audience: string, template: string) =>
      asTenant(db, actor, (tx) => tx.execute(sql`select public.app_enqueue_lead_email(${lead}::uuid, ${audience}::text[], ${template}, '{}'::jsonb, 's', 'b', ${ORIGIN})`));
    await denied(call(cast.otherAgency, agencyDb(), one.leadId, "{fynix}", "lead_waiting"), /domain:not-authorised/);
    await denied(call(cast.otherClient, clientDb(), one.leadId, "{fynix}", "lead_waiting"), /domain:not-authorised/);
    await denied(call(cast.coordinator, agencyDb(), one.leadId, "{fynix}", "invite"), /domain:invalid-input/);
    await denied(call(cast.coordinator, agencyDb(), one.leadId, "{fynix}", "password_reset"), /domain:invalid-input/);
    await denied(call(cast.coordinator, agencyDb(), one.leadId, "{everyone}", "lead_waiting"), /domain:invalid-input/);
    await denied(call(cast.coordinator, agencyDb(), one.leadId, "{prospect,fynix}", "prospect_confirmed"), /domain:invalid-input/);
    await denied(call(cast.coordinator, agencyDb(), one.leadId, "{prospect}", "lead_waiting"), /domain:invalid-input/);
    await denied(call(cast.coordinator, agencyDb(), one.leadId, "{fynix}", "prospect_confirmed"), /domain:invalid-input/);
    expect(await mails("password_reset")).toEqual([]);
    // Nobody signed in: no scope, no user.
    await denied(rig.dbs.roles.leads_agency.db.execute(sql`select public.app_enqueue_lead_email(${one.leadId}::uuid, '{fynix}'::text[], 'lead_waiting', '{}'::jsonb, 's', 'b', ${ORIGIN})`), /domain:not-authorised/);
  });

  it("never reaches a person outside the lead, whatever the audience says", async () => {
    emailsOn();
    const one = await sent("partner");
    await clearMail();
    await asTenant(agencyDb(), cast.partner, (tx) => tx.execute(sql`select public.app_enqueue_lead_email(${one.leadId}::uuid, '{client,client_meeting,source,coordinator,partner_coordinator,fynix}'::text[], 'lead_waiting', '{"ref":"LD-4K7M","company":"X"}'::jsonb, 's', 'b', ${ORIGIN})`));
    const people = await ownerDb().select({ id: user.id, email: user.email }).from(user);
    const got = (await mails("lead_waiting")).map((row) => people.find((person) => person.email === row.recipient)?.id);
    const allowed = new Set([cast.clientActor.userId, cast.clientColleague.userId, cast.coordinator.userId, cast.coordinatorColleague.userId, cast.fynixAdmin, cast.fynixStaff]);
    expect(got.length).toBeGreaterThan(0);
    for (const id of got) expect(allowed.has(id ?? "")).toBe(true);
    expect(got).not.toContain(cast.partner.userId);
    expect(got).not.toContain(cast.otherClient.userId);
    expect(got).not.toContain(cast.otherAgency.userId);
  });
});

describe("the meeting room", () => {
  const ROOM = { url: "https://meet.google.com/abc-defg-hij", spaceId: "spaces/abc123" } as const;
  const provider = (overrides: Partial<MeetProvider> = {}): MeetProvider & { readonly created: number[] } => {
    const created: number[] = [];
    return {
      created,
      createRoom: async () => {
        created.push(1);
        return ROOM;
      },
      readJoinRecord: async () => [],
      ...overrides,
    };
  };

  it("is made when the client picks a time, keeps the same link through a postponement, and its space is never readable by a tenant", async () => {
    emailsOn();
    await prospectEmailOn();
    const meet = provider();
    const one = await sent();
    await clearMail();
    await clientReviewLead(clientDb(), { ...rig.deps(), meet }, cast.clientActor, { leadId: one.leadId, action: "accept", selectedMeetingTime: one.time });
    expect(meet.created).toHaveLength(1);
    const mine = (await listClientMeetings(clientDb(), cast.clientActor)).find((row) => row.leadId === one.leadId);
    expect(mine?.googleMeetUrl).toBe(ROOM.url);
    expect(Object.keys(mine ?? {})).not.toContain("googleSpaceId");
    const row = await meetingRow(mine?.id ?? "");
    expect(row).toMatchObject({ url: ROOM.url, space: ROOM.spaceId });
    // The emails carry the link: the prospect's in its body, the staff's in theirs.
    expect((await mails("prospect_confirmed"))[0]?.params.meetUrl).toBe(ROOM.url);
    expect((await mails("meeting_booked"))[0]?.params.meetUrl).toBe(ROOM.url);
    const later = nextWeekdayAt(11, 6);
    await proposePostponement(agencyDb(), rig.deps(), cast.coordinator, { meetingId: mine?.id ?? "", proposedTimes: [later] });
    const [proposal] = await asTenant(clientDb(), cast.clientActor, (tx) => tx.execute<{ id: string }>(sql`select id from meeting_reschedule where meeting_id = ${mine?.id ?? ""}::uuid`)).then((result) => result.rows);
    await pickPostponement(clientDb(), rig.deps(), cast.clientActor, { rescheduleId: proposal?.id, pickedTime: later });
    expect(meet.created).toHaveLength(1);
    expect(await meetingRow(mine?.id ?? "")).toMatchObject({ url: ROOM.url, space: ROOM.spaceId });
    expect((await mails("prospect_moved"))[0]?.params.meetUrl).toBe(ROOM.url);
    await denied(asTenant(clientDb(), cast.clientActor, (tx) => tx.execute(sql`select google_space_id from meeting`)), /permission denied for table meeting/);
  });

  it("is made for Fynix's pick of a time as well, and a failure to make one books the meeting with no link and fails nothing", async () => {
    const meet = provider();
    const picked = await sent();
    await fynixAnswerForClient({ ...rig.deps(), meet }, rig.actor, { leadId: picked.leadId, answer: "pick_time", selectedMeetingTime: picked.time, note: "The client asked us to pick" });
    expect(meet.created).toHaveLength(1);
    const failing = provider({ createRoom: async () => Promise.reject(new Error("Google is down for victim@example.com")) });
    const logged: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void logged.push(args.join(" "));
    try {
      const one = await sent();
      await clientReviewLead(clientDb(), { ...rig.deps(), meet: failing }, cast.clientActor, { leadId: one.leadId, action: "accept", selectedMeetingTime: one.time });
      const mine = (await listClientMeetings(clientDb(), cast.clientActor)).find((row) => row.leadId === one.leadId);
      expect(mine?.googleMeetUrl).toBeNull();
      expect(mine?.outcome).toBe("scheduled");
    } finally {
      console.error = original;
    }
    expect(logged).toEqual(["A meeting room could not be created (Error)."]);
  });

  it("is not made at all when there is no provider: the link stays null", async () => {
    const one = await booked();
    expect((await meetingRow(one.meetingId)).url).toBeNull();
  });
});

describe("the join record", () => {
  const entries: readonly JoinEntry[] = [
    { displayName: "Marta Lindqvist", joinedAt: new Date("2026-12-08T14:29:00Z"), leftAt: new Date("2026-12-08T15:00:00Z"), durationSeconds: 1860 },
    { displayName: "Guest", joinedAt: new Date("2026-12-08T14:31:00Z"), leftAt: null, durationSeconds: 0 },
  ];
  const withRoom = async () => {
    const one = await booked();
    await ownerDb().update(meeting).set({ googleSpaceId: "spaces/abc123", googleMeetUrl: "https://meet.google.com/abc-defg-hij" }).where(eq(meeting.id, one.meetingId));
    const start = (await meetingRow(one.meetingId)).start;
    return { ...one, start };
  };

  it("is read once, 30 minutes after the meeting ended, keeps name, time and length only, and is read by all four parties and no one else", async () => {
    const one = await withRoom();
    let reads = 0;
    const meet: MeetProvider = {
      createRoom: async () => null,
      readJoinRecord: async (space) => {
        reads += 1;
        expect(space).toBe("spaces/abc123");
        return entries;
      },
    };
    expect(await importJoinRecords(authDb(), meet, hours(one.start, 0.9))).toBe(0);
    expect(reads).toBe(0);
    expect(await importJoinRecords(authDb(), meet, hours(one.start, 1.1))).toBe(1);
    expect(await importJoinRecords(authDb(), meet, hours(one.start, 2))).toBe(0);
    expect(reads).toBe(1);
    expect((await meetingRow(one.meetingId)).joinImportedAt).not.toBeNull();
    const stored = await ownerDb().select({ name: meetingJoin.displayName, seconds: meetingJoin.durationSeconds, left: meetingJoin.leftAt }).from(meetingJoin).where(eq(meetingJoin.meetingId, one.meetingId)).orderBy(asc(meetingJoin.joinedAt));
    expect(stored).toEqual([
      { name: "Marta Lindqvist", seconds: 1860, left: new Date("2026-12-08T15:00:00Z") },
      { name: "Guest", seconds: 0, left: null },
    ]);
    expect(Object.keys((await ownerDb().select().from(meetingJoin))[0] ?? {}).sort()).toEqual(["createdAt", "displayName", "durationSeconds", "id", "joinedAt", "leftAt", "meetingId"]);

    const seenBy = async (rows: Promise<readonly unknown[]>) => (await rows).length;
    expect(await seenBy(listMeetingJoins(clientDb(), cast.clientActor, [one.meetingId]))).toBe(2);
    expect(await seenBy(listMeetingJoins(clientDb(), cast.clientColleague, [one.meetingId]))).toBe(2);
    expect(await seenBy(listMeetingJoins(agencyDb(), cast.coordinator, [one.meetingId]))).toBe(2);
    expect(await seenBy(listMeetingJoins(agencyDb(), cast.coordinatorColleague, [one.meetingId]))).toBe(2);
    expect(await seenBy(listMeetingJoinsForFynix(rig.deps(), rig.actor, [one.meetingId]))).toBe(2);
    expect(await seenBy(listMeetingJoins(clientDb(), cast.otherClient, [one.meetingId]))).toBe(0);
    expect(await seenBy(listMeetingJoins(agencyDb(), cast.otherAgency, [one.meetingId]))).toBe(0);
    expect(Object.keys((await listMeetingJoins(clientDb(), cast.clientActor, [one.meetingId]))[0] ?? {}).sort()).toEqual(Object.keys(meetingJoinColumns).sort());
    // A partner agency that did not send the lead and holds no share of it reads nothing; the one that sent it reads it (checked above for the coordinator).
    await denied(asTenant(clientDb(), cast.clientActor, (tx) => tx.execute(sql`insert into meeting_join (meeting_id, display_name, joined_at, duration_seconds) values (${one.meetingId}::uuid, 'x', now(), 0)`)), /permission denied for table meeting_join/);
  });

  it("is left unstamped when the room cannot be read, and read at the next run; a meeting with no room, or cancelled, is never read", async () => {
    const one = await withRoom();
    let fail = true;
    const meet: MeetProvider = { createRoom: async () => null, readJoinRecord: async () => (fail ? Promise.reject(new Error("Google is down")) : entries) };
    const when = hours(one.start, 2);
    expect(await importJoinRecords(authDb(), meet, when)).toBe(0);
    expect((await meetingRow(one.meetingId)).joinImportedAt).toBeNull();
    fail = false;
    expect(await importJoinRecords(authDb(), meet, when)).toBe(1);

    const noRoom = await booked();
    const cancelled = await withRoom();
    await fynixMarkLost(rig.deps(), rig.actor, { leadId: cancelled.leadId, note: "Closed by Fynix after a call" });
    const calls: string[] = [];
    const watching: MeetProvider = { createRoom: async () => null, readJoinRecord: async (space) => (calls.push(space), []) };
    expect(await importJoinRecords(authDb(), watching, hours(new Date(), 24 * 30))).toBe(0);
    expect(calls).toEqual([]);
    expect((await meetingRow(noRoom.meetingId)).joinImportedAt).toBeNull();
  });
});
