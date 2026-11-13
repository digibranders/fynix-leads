import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { campaignHost, member } from "@/server/db/schema";
import { DomainError } from "@/server/domain/errors";
import { addCampaignHost, deactivateCampaignHost } from "@/server/domain/hosts";
import { auditRowsFor, firstCampaign, memberIdFor, refusal, userIn } from "@/server/domain/test-helpers";
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
const stored = () => rig.dbs.owner.db.select().from(campaignHost);
/** Kestrel is the client of the first campaign; its one user is the host in these tests. */
const kestrelMember = () => memberIdFor(rig, userIn(rig, rig.world().kestrel).id);
const hostInput = async (overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> => ({ campaignId: firstCampaign(rig).id, memberId: await kestrelMember(), jobTitle: "Chief Operating Officer", ...overrides });

describe("addCampaignHost", () => {
  it("adds an active member of the campaign's client as a host, with the client copied from the campaign, and audits it", async () => {
    const host = await addCampaignHost(rig.deps(), rig.actor, await hostInput());
    expect(host).toEqual({ campaignId: firstCampaign(rig).id, memberId: await kestrelMember(), displayName: userIn(rig, rig.world().kestrel).name, jobTitle: "Chief Operating Officer", active: true });
    expect(await stored()).toMatchObject([{ campaignId: firstCampaign(rig).id, clientOrgId: rig.world().kestrel.id, jobTitle: "Chief Operating Officer", active: true }]);
    const [audit] = await auditRowsFor(rig, "campaign_host.add");
    expect(audit).toMatchObject({ actorUserId: rig.actor.userId, subjectTable: "campaign_host", before: null, after: { campaignId: firstCampaign(rig).id, memberId: await kestrelMember(), jobTitle: "Chief Operating Officer", active: true } });
    expect(audit?.subjectRef).toBe(firstCampaign(rig).publicRef);
  });

  it("refuses a member of another client, a member of an agency, a Fynix member, a suspended member and an unknown member, with not-a-client-member", async () => {
    const world = rig.world();
    for (const person of [userIn(rig, world.halden), userIn(rig, world.brightpath), { id: rig.actor.userId }]) {
      expect((await refusal(addCampaignHost(rig.deps(), rig.actor, await hostInput({ memberId: await memberIdFor(rig, person.id) })))).code, person.id).toBe("not-a-client-member");
    }
    expect((await refusal(addCampaignHost(rig.deps(), rig.actor, await hostInput({ memberId: UNKNOWN })))).code).toBe("not-a-client-member");
    await rig.dbs.owner.db.update(member).set({ status: "suspended" }).where(eq(member.id, await kestrelMember()));
    expect((await refusal(addCampaignHost(rig.deps(), rig.actor, await hostInput()))).code).toBe("not-a-client-member");
    expect(await stored()).toEqual([]);
    expect(await auditRowsFor(rig)).toEqual([]);
  });

  it("waits for a suspension that is still in flight, then refuses the member", async () => {
    const memberId = await kestrelMember();
    const input = await hostInput();
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let suspended: () => void = () => undefined;
    const suspendedStarted = new Promise<void>((resolve) => {
      suspended = resolve;
    });
    const suspension = rig.dbs.owner.db.transaction(async (tx) => {
      // A failed test must end the run: the database drops this transaction if it sits idle for ten seconds.
      await tx.execute(sql`set local idle_in_transaction_session_timeout = '10s'`);
      await tx.update(member).set({ status: "suspended" }).where(eq(member.id, memberId));
      suspended();
      await held;
    });
    await suspendedStarted;
    let settled = false;
    const adding = addCampaignHost(rig.deps(), rig.actor, input).then(
      () => "added",
      (error: unknown) => (error instanceof DomainError ? error.code : "other error"),
    );
    void adding.then(() => {
      settled = true;
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(settled).toBe(false);
    } finally {
      release();
      await suspension;
    }
    expect(await adding).toBe("not-a-client-member");
    expect(await stored()).toEqual([]);
  });

  it("refuses a host who is one already, an unknown campaign, a blank job title and a field it does not know", async () => {
    await addCampaignHost(rig.deps(), rig.actor, await hostInput());
    expect((await refusal(addCampaignHost(rig.deps(), rig.actor, await hostInput({ jobTitle: "Another title" })))).code).toBe("invalid-transition");
    expect((await refusal(addCampaignHost(rig.deps(), rig.actor, await hostInput({ campaignId: UNKNOWN })))).code).toBe("not-found");
    expect((await refusal(addCampaignHost(rig.deps(), rig.actor, await hostInput({ jobTitle: "   " })))).code).toBe("invalid-input");
    expect((await refusal(addCampaignHost(rig.deps(), rig.actor, await hostInput({ active: false })))).code).toBe("invalid-input");
    expect(await stored()).toHaveLength(1);
    expect(await auditRowsFor(rig, "campaign_host.add")).toHaveLength(1);
  });

  it("reactivates a deactivated host with the new title, on the same row, and audits the before and after", async () => {
    await addCampaignHost(rig.deps(), rig.actor, await hostInput());
    await deactivateCampaignHost(rig.deps(), rig.actor, { campaignId: firstCampaign(rig).id, memberId: await kestrelMember() });
    const again = await addCampaignHost(rig.deps(), rig.actor, await hostInput({ jobTitle: "Head of Operations" }));
    expect(again).toMatchObject({ jobTitle: "Head of Operations", active: true });
    expect(await stored()).toHaveLength(1);
    const audits = await auditRowsFor(rig, "campaign_host.add");
    expect(audits[1]).toMatchObject({ before: { jobTitle: "Chief Operating Officer", active: false }, after: { jobTitle: "Head of Operations", active: true } });
  });

  it("is refused to Fynix staff", async () => {
    expect((await refusal(addCampaignHost(rig.deps(), rig.staffActor, await hostInput()))).code).toBe("admin-required");
    expect(await stored()).toEqual([]);
  });
});

describe("deactivateCampaignHost", () => {
  it("switches a host off and keeps the row, and audits the before and after", async () => {
    await addCampaignHost(rig.deps(), rig.actor, await hostInput());
    const host = await deactivateCampaignHost(rig.deps(), rig.actor, { campaignId: firstCampaign(rig).id, memberId: await kestrelMember() });
    expect(host).toMatchObject({ active: false, jobTitle: "Chief Operating Officer" });
    expect(await stored()).toMatchObject([{ active: false }]);
    const [audit] = await auditRowsFor(rig, "campaign_host.deactivate");
    expect(audit).toMatchObject({ before: { active: true }, after: { active: false } });
  });

  it("refuses a member who is not a host, a host who is deactivated already, and a malformed input", async () => {
    const input = { campaignId: firstCampaign(rig).id, memberId: await kestrelMember() };
    expect((await refusal(deactivateCampaignHost(rig.deps(), rig.actor, input))).code).toBe("not-found");
    await addCampaignHost(rig.deps(), rig.actor, await hostInput());
    await deactivateCampaignHost(rig.deps(), rig.actor, input);
    expect((await refusal(deactivateCampaignHost(rig.deps(), rig.actor, input))).code).toBe("invalid-transition");
    expect((await refusal(deactivateCampaignHost(rig.deps(), rig.actor, { ...input, memberId: "x" }))).code).toBe("invalid-input");
  });

  it("is refused to Fynix staff", async () => {
    await addCampaignHost(rig.deps(), rig.actor, await hostInput());
    const input = { campaignId: firstCampaign(rig).id, memberId: await kestrelMember() };
    expect((await refusal(deactivateCampaignHost(rig.deps(), rig.staffActor, input))).code).toBe("admin-required");
    expect(await stored()).toMatchObject([{ active: true }]);
  });
});
