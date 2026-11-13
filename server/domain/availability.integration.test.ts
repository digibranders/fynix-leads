import { asc } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hostBlock, hostHours } from "@/server/db/schema";
import { addHostBlock, removeHostBlock, setHostHours } from "@/server/domain/availability";
import { auditRowsFor, memberIdFor, refusal, userIn } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});
beforeEach(async () => {
  await rig.reset();
});

const UNKNOWN = "99999999-9999-4999-8999-999999999999";
const hostMember = () => memberIdFor(rig, userIn(rig, rig.world().kestrel).id);
const win = (weekday: number, startMinute: number, endMinute: number) => ({ weekday, startMinute, endMinute });
const hoursInput = async (hours: readonly ReturnType<typeof win>[], overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> => ({ memberId: await hostMember(), timeZone: "Europe/London", hours, ...overrides });
const hourRows = () => rig.dbs.owner.db.select().from(hostHours).orderBy(asc(hostHours.weekday), asc(hostHours.startMinute));
const blockRows = () => rig.dbs.owner.db.select().from(hostBlock).orderBy(asc(hostBlock.startsAt));

describe("setHostHours", () => {
  it("stores a weekly set in the host's time zone, sorted, and audits the before and after", async () => {
    const result = await setHostHours(rig.deps(), rig.actor, await hoursInput([win(2, 540, 1020), win(1, 780, 1020), win(1, 540, 720)]));
    expect(result).toEqual({ memberId: await hostMember(), timeZone: "Europe/London", hours: [win(1, 540, 720), win(1, 780, 1020), win(2, 540, 1020)] });
    expect((await hourRows()).map((row) => [row.weekday, row.startMinute, row.endMinute, row.timeZone])).toEqual([
      [1, 540, 720, "Europe/London"],
      [1, 780, 1020, "Europe/London"],
      [2, 540, 1020, "Europe/London"],
    ]);
    const [audit] = await auditRowsFor(rig, "host_hours.set");
    expect(audit).toMatchObject({
      actorUserId: rig.actor.userId,
      subjectTable: "host_hours",
      subjectId: await hostMember(),
      before: { timeZone: null, windows: [] },
      after: { timeZone: "Europe/London", windows: [win(1, 540, 720), win(1, 780, 1020), win(2, 540, 1020)] },
    });
  });

  it("leaves one consistent set when two parallel calls replace the same host's hours", async () => {
    const first = await hoursInput([win(1, 540, 1020), win(3, 540, 1020)], { timeZone: "Europe/London" });
    const second = await hoursInput([win(1, 480, 720), win(1, 780, 960), win(5, 600, 900)], { timeZone: "Asia/Kolkata" });
    await Promise.all([setHostHours(rig.deps(), rig.actor, first), setHostHours(rig.deps(), rig.actor, second)]);
    const rows = (await hourRows()).map((row) => [row.timeZone, row.weekday, row.startMinute, row.endMinute]);
    const asRows = (input: Record<string, unknown>) => (input.hours as readonly ReturnType<typeof win>[]).map((slot) => [input.timeZone, slot.weekday, slot.startMinute, slot.endMinute]);
    expect([asRows(first), asRows(second)]).toContainEqual(rows);
    expect(await auditRowsFor(rig, "host_hours.set")).toHaveLength(2);
  });

  it("replaces the whole set, so the old windows and the old time zone are gone, and the audit row holds the old set", async () => {
    await setHostHours(rig.deps(), rig.actor, await hoursInput([win(1, 540, 1020), win(3, 540, 1020)]));
    await setHostHours(rig.deps(), rig.actor, await hoursInput([win(5, 600, 900)], { timeZone: "Asia/Kolkata" }));
    expect((await hourRows()).map((row) => [row.weekday, row.timeZone])).toEqual([[5, "Asia/Kolkata"]]);
    const audits = await auditRowsFor(rig, "host_hours.set");
    expect(audits[1]).toMatchObject({ before: { timeZone: "Europe/London", windows: [win(1, 540, 1020), win(3, 540, 1020)] }, after: { timeZone: "Asia/Kolkata", windows: [win(5, 600, 900)] } });
  });

  it("clears the set when it is given none, and accepts adjacent windows and a full day", async () => {
    await setHostHours(rig.deps(), rig.actor, await hoursInput([win(1, 540, 720), win(1, 720, 1020), win(0, 0, 1440)]));
    expect(await hourRows()).toHaveLength(3);
    expect(await setHostHours(rig.deps(), rig.actor, await hoursInput([]))).toMatchObject({ hours: [] });
    expect(await hourRows()).toEqual([]);
  });

  it.each([
    ["two windows that overlap", [win(1, 540, 720), win(1, 700, 800)]],
    ["a window inside another", [win(1, 540, 1020), win(1, 600, 660)]],
    ["a window that ends where it starts", [win(1, 600, 600)]],
    ["a window that ends before it starts", [win(1, 700, 600)]],
    ["a weekday of 7", [win(7, 540, 600)]],
    ["an end after midnight", [win(1, 540, 1441)]],
    ["a negative start", [win(1, -5, 600)]],
    ["a fractional minute", [win(1, 540.5, 600)]],
  ])("refuses %s, and keeps the set it had", async (_label, hours) => {
    await setHostHours(rig.deps(), rig.actor, await hoursInput([win(1, 540, 1020)]));
    expect((await refusal(setHostHours(rig.deps(), rig.actor, await hoursInput(hours)))).code).toBe("invalid-input");
    expect((await hourRows()).map((row) => [row.weekday, row.startMinute, row.endMinute])).toEqual([[1, 540, 1020]]);
    expect(await auditRowsFor(rig, "host_hours.set")).toHaveLength(1);
  });

  it("refuses an unknown time zone, an offset, more than 70 windows and a field it does not know", async () => {
    expect((await refusal(setHostHours(rig.deps(), rig.actor, await hoursInput([win(1, 540, 600)], { timeZone: "Mars/Olympus" })))).code).toBe("invalid-input");
    expect((await refusal(setHostHours(rig.deps(), rig.actor, await hoursInput([win(1, 540, 600)], { timeZone: "+01:00" })))).code).toBe("invalid-input");
    const tooMany = Array.from({ length: 71 }, (_, index) => win(index % 7, 0, 1));
    expect((await refusal(setHostHours(rig.deps(), rig.actor, await hoursInput(tooMany)))).code).toBe("invalid-input");
    expect((await refusal(setHostHours(rig.deps(), rig.actor, await hoursInput([win(1, 540, 600)], { campaignId: UNKNOWN })))).code).toBe("invalid-input");
    expect(await hourRows()).toEqual([]);
  });

  it("refuses a member who is not an active member of a client, with not-a-client-member", async () => {
    const world = rig.world();
    for (const userId of [userIn(rig, world.brightpath).id, rig.actor.userId]) {
      expect((await refusal(setHostHours(rig.deps(), rig.actor, await hoursInput([win(1, 540, 600)], { memberId: await memberIdFor(rig, userId) })))).code, userId).toBe("not-a-client-member");
    }
    expect((await refusal(setHostHours(rig.deps(), rig.actor, await hoursInput([win(1, 540, 600)], { memberId: UNKNOWN })))).code).toBe("not-a-client-member");
    expect(await hourRows()).toEqual([]);
  });

  it("is refused to Fynix staff", async () => {
    expect((await refusal(setHostHours(rig.deps(), rig.staffActor, await hoursInput([win(1, 540, 600)])))).code).toBe("admin-required");
    expect(await hourRows()).toEqual([]);
  });
});

describe("addHostBlock", () => {
  const blockInput = async (overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> => ({ memberId: await hostMember(), startsAt: "2027-01-04T09:00:00Z", endsAt: "2027-01-04T11:00:00Z", note: "Dentist", ...overrides });

  it("blocks a time, accepts an offset, and audits it", async () => {
    const block = await addHostBlock(rig.deps(), rig.actor, await blockInput({ startsAt: "2027-01-04T10:00:00+01:00" }));
    expect(block).toMatchObject({ memberId: await hostMember(), note: "Dentist" });
    expect(block.startsAt.toISOString()).toBe("2027-01-04T09:00:00.000Z");
    expect(block.endsAt.toISOString()).toBe("2027-01-04T11:00:00.000Z");
    expect(await blockRows()).toHaveLength(1);
    const [audit] = await auditRowsFor(rig, "host_block.add");
    expect(audit).toMatchObject({ subjectTable: "host_block", subjectId: block.id, before: null, after: { memberId: await hostMember(), startsAt: "2027-01-04T09:00:00.000Z", endsAt: "2027-01-04T11:00:00.000Z", note: "Dentist" } });
  });

  it("allows overlapping blocks and an empty note", async () => {
    await addHostBlock(rig.deps(), rig.actor, await blockInput());
    await addHostBlock(rig.deps(), rig.actor, await blockInput({ startsAt: "2027-01-04T10:00:00Z", endsAt: "2027-01-04T12:00:00Z", note: "" }));
    expect(await blockRows()).toHaveLength(2);
  });

  it.each([
    ["a block that ends where it starts", { endsAt: "2027-01-04T09:00:00Z" }],
    ["a block that ends before it starts", { endsAt: "2027-01-04T08:00:00Z" }],
    ["a time with no offset", { startsAt: "2027-01-04T09:00:00" }],
    ["a date that is not a time", { startsAt: "next Tuesday" }],
    ["a note over 500 characters", { note: "x".repeat(501) }],
  ])("refuses %s, and writes nothing", async (_label, overrides) => {
    expect((await refusal(addHostBlock(rig.deps(), rig.actor, await blockInput(overrides)))).code).toBe("invalid-input");
    expect(await blockRows()).toEqual([]);
  });

  it("refuses a member who is not an active member of a client, and is refused to Fynix staff", async () => {
    expect((await refusal(addHostBlock(rig.deps(), rig.actor, await blockInput({ memberId: await memberIdFor(rig, userIn(rig, rig.world().brightpath).id) })))).code).toBe("not-a-client-member");
    expect((await refusal(addHostBlock(rig.deps(), rig.staffActor, await blockInput()))).code).toBe("admin-required");
    expect(await blockRows()).toEqual([]);
  });
});

describe("removeHostBlock", () => {
  it("removes a block and audits what it was", async () => {
    const block = await addHostBlock(rig.deps(), rig.actor, { memberId: await hostMember(), startsAt: "2027-01-04T09:00:00Z", endsAt: "2027-01-04T11:00:00Z", note: "Dentist" });
    await removeHostBlock(rig.deps(), rig.actor, block.id);
    expect(await blockRows()).toEqual([]);
    const [audit] = await auditRowsFor(rig, "host_block.remove");
    expect(audit).toMatchObject({ subjectId: block.id, before: { note: "Dentist", startsAt: "2027-01-04T09:00:00.000Z" }, after: null });
  });

  it("refuses an unknown block and a malformed id, and is refused to Fynix staff", async () => {
    const block = await addHostBlock(rig.deps(), rig.actor, { memberId: await hostMember(), startsAt: "2027-01-04T09:00:00Z", endsAt: "2027-01-04T11:00:00Z" });
    expect((await refusal(removeHostBlock(rig.deps(), rig.actor, UNKNOWN))).code).toBe("not-found");
    expect((await refusal(removeHostBlock(rig.deps(), rig.actor, "x"))).code).toBe("invalid-input");
    expect((await refusal(removeHostBlock(rig.deps(), rig.staffActor, block.id))).code).toBe("admin-required");
    expect(await blockRows()).toHaveLength(1);
  });
});
