import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agreement, agreementAcceptance, member } from "@/server/db/schema";
import { publishAgreement, readAgreements, recordAgreementAcceptance } from "@/server/domain/agreements";
import { auditRowsFor, firstCampaign, memberIdFor, refusal, setMemberRole, userIn } from "@/server/domain/test-helpers";
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
const base = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({ campaignId: firstCampaign(rig).id, party: "client", monthlyTarget: 20, totalTarget: 120, ...overrides });
const stored = () => rig.dbs.owner.db.select().from(agreement).orderBy(asc(agreement.party), asc(agreement.version), asc(agreement.createdAt));
const acceptances = () => rig.dbs.owner.db.select().from(agreementAcceptance);

describe("publishAgreement", () => {
  it("publishes version 1 as current, in the admin's name, with the defaults, and audits it", async () => {
    const created = await publishAgreement(rig.deps(), rig.actor, base({ rules: "A no-show counts after 10 minutes", notes: "Review each quarter" }));
    expect(created).toMatchObject({ campaignId: firstCampaign(rig).id, party: "client", version: 1, monthlyTarget: 20, totalTarget: 120, disputeWindowHours: 48, rules: "A no-show counts after 10 minutes", notes: "Review each quarter", status: "current", acceptances: [] });
    const [row] = await stored();
    expect(row).toMatchObject({ id: created.id, createdBy: await memberIdFor(rig, rig.actor.userId) });
    const [audit] = await auditRowsFor(rig, "agreement.publish");
    expect(audit).toMatchObject({ actorUserId: rig.actor.userId, subjectTable: "agreement", subjectId: created.id, before: null, after: { party: "client", version: 1, monthlyTarget: 20, totalTarget: 120, disputeWindowHours: 48, status: "current" } });
    expect(audit?.subjectRef).toBe(`${firstCampaign(rig).publicRef} client v1`);
  });

  it("supersedes the current version with the next one, keeps the old row as it was, and audits the before and after", async () => {
    const first = await publishAgreement(rig.deps(), rig.actor, base());
    const second = await publishAgreement(rig.deps(), rig.actor, base({ monthlyTarget: 25, totalTarget: 150, disputeWindowHours: 72 }));
    expect(second).toMatchObject({ version: 2, monthlyTarget: 25, status: "current" });
    expect((await stored()).map((row) => [row.version, row.status, row.monthlyTarget])).toEqual([
      [1, "superseded", 20],
      [2, "current", 25],
    ]);
    const audits = await auditRowsFor(rig, "agreement.publish");
    expect(audits[1]).toMatchObject({ subjectId: second.id, before: { version: 1, status: "current", monthlyTarget: 20 }, after: { version: 2, status: "current", monthlyTarget: 25, disputeWindowHours: 72 } });
    expect(first.id).not.toBe(second.id);
  });

  it("gives two parallel publications for the same campaign and party versions 1 and 2, with exactly one current", async () => {
    const results = await Promise.all([publishAgreement(rig.deps(), rig.actor, base({ monthlyTarget: 20 })), publishAgreement(rig.deps(), rig.actor, base({ monthlyTarget: 30 }))]);
    expect(results.map((result) => result.version).sort()).toEqual([1, 2]);
    const rows = await stored();
    expect(rows.map((row) => [row.version, row.status])).toEqual([
      [1, "superseded"],
      [2, "current"],
    ]);
    expect(await auditRowsFor(rig, "agreement.publish")).toHaveLength(2);
  });

  it("numbers versions per campaign and party: the two parties are independent, and so are two campaigns", async () => {
    await publishAgreement(rig.deps(), rig.actor, base());
    await publishAgreement(rig.deps(), rig.actor, base({ party: "supplier", monthlyTarget: 18 }));
    const other = rig.world().campaigns[1];
    if (other === undefined) throw new Error("no second campaign");
    await publishAgreement(rig.deps(), rig.actor, base({ campaignId: other.id }));
    expect((await stored()).map((row) => [row.campaignId === firstCampaign(rig).id, row.party, row.version, row.status])).toEqual([
      [true, "client", 1, "current"],
      [false, "client", 1, "current"],
      [true, "supplier", 1, "current"],
    ]);
  });

  it.each([
    ["an unknown campaign", { campaignId: UNKNOWN }, "not-found"],
    ["a party that is neither client nor coordinator", { party: "agency" }, "invalid-input"],
    ["a negative target", { monthlyTarget: -1 }, "invalid-input"],
    ["a fractional target", { totalTarget: 1.5 }, "invalid-input"],
    ["a dispute window of 0 hours", { disputeWindowHours: 0 }, "invalid-input"],
    ["a dispute window over 720 hours", { disputeWindowHours: 721 }, "invalid-input"],
    ["a field it does not know", { status: "superseded" }, "invalid-input"],
  ])("refuses %s, and writes nothing", async (_label, overrides, code) => {
    await publishAgreement(rig.deps(), rig.actor, base());
    expect((await refusal(publishAgreement(rig.deps(), rig.actor, base(overrides)))).code).toBe(code);
    expect(await stored()).toHaveLength(1);
    expect(await auditRowsFor(rig)).toHaveLength(1);
  });

  it("is refused to Fynix staff", async () => {
    expect((await refusal(publishAgreement(rig.deps(), rig.staffActor, base()))).code).toBe("admin-required");
    expect(await stored()).toEqual([]);
    expect(await auditRowsFor(rig)).toEqual([]);
  });
});

describe("readAgreements", () => {
  it("returns, for each party, the current version and the superseded ones newest first, with their acceptances", async () => {
    const campaignId = firstCampaign(rig).id;
    const v1 = await publishAgreement(rig.deps(), rig.actor, base());
    await publishAgreement(rig.deps(), rig.actor, base({ monthlyTarget: 22 }));
    const v3 = await publishAgreement(rig.deps(), rig.actor, base({ monthlyTarget: 24 }));
    await publishAgreement(rig.deps(), rig.actor, base({ party: "supplier", monthlyTarget: 18 }));
    const kestrelUser = userIn(rig, rig.world().kestrel);
    await setMemberRole(rig, kestrelUser.id, "manager");
    await recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: v3.id, userId: kestrelUser.id });

    const read = await readAgreements(rig.deps(), rig.actor, campaignId);
    expect(read.client.party).toBe("client");
    expect(read.client.current).toMatchObject({ id: v3.id, version: 3, monthlyTarget: 24, status: "current" });
    expect(read.client.current?.acceptances).toMatchObject([{ userId: kestrelUser.id, networkAddress: "recorded by Fynix" }]);
    expect(read.client.history.map((row) => [row.version, row.monthlyTarget])).toEqual([
      [2, 22],
      [1, 20],
    ]);
    expect(read.client.history.find((row) => row.id === v1.id)?.acceptances).toEqual([]);
    expect(read.supplier.current).toMatchObject({ version: 1, monthlyTarget: 18 });
    expect(read.supplier.history).toEqual([]);
  });

  it("returns no current version and no history for a campaign with no agreements, and refuses an unknown campaign", async () => {
    const read = await readAgreements(rig.deps(), rig.actor, firstCampaign(rig).id);
    expect(read.client).toEqual({ party: "client", current: null, history: [] });
    expect(read.supplier).toEqual({ party: "supplier", current: null, history: [] });
    expect((await refusal(readAgreements(rig.deps(), rig.actor, UNKNOWN))).code).toBe("not-found");
    expect((await refusal(readAgreements(rig.deps(), rig.actor, "not-a-uuid"))).code).toBe("invalid-input");
  });

  it("is open to Fynix staff, who read set-up but do not change it", async () => {
    await publishAgreement(rig.deps(), rig.actor, base());
    const read = await readAgreements(rig.deps(), rig.staffActor, firstCampaign(rig).id);
    expect(read.client.current?.version).toBe(1);
  });
});

describe("recordAgreementAcceptance", () => {
  /** Kestrel is the client of the first campaign and Brightpath its supplier. Their one user each is an ordinary member until a test promotes them. */
  const clientUser = () => userIn(rig, rig.world().kestrel);
  const supplierUser = () => userIn(rig, rig.world().brightpath);

  it("records a client manager's acceptance of the client agreement, from Fynix, with a default network address, and audits it", async () => {
    await setMemberRole(rig, clientUser().id, "manager");
    const published = await publishAgreement(rig.deps(), rig.actor, base());
    const accepted = await recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: published.id, userId: clientUser().id });
    expect(accepted).toMatchObject({ agreementId: published.id, userId: clientUser().id, networkAddress: "recorded by Fynix" });
    expect(accepted.acceptedAt).toBeInstanceOf(Date);
    expect(await acceptances()).toHaveLength(1);
    const [audit] = await auditRowsFor(rig, "agreement.accept");
    expect(audit).toMatchObject({ subjectTable: "agreement_acceptance", before: null, after: { agreementId: published.id, userId: clientUser().id, networkAddress: "recorded by Fynix" } });
    expect(audit?.subjectRef).toBe(`${firstCampaign(rig).publicRef} client v1`);
  });

  it("records a coordinator manager's acceptance of the coordinator agreement, and keeps a network address it is given", async () => {
    await setMemberRole(rig, supplierUser().id, "manager");
    const published = await publishAgreement(rig.deps(), rig.actor, base({ party: "supplier" }));
    const accepted = await recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: published.id, userId: supplierUser().id, networkAddress: "203.0.113.7" });
    expect(accepted.networkAddress).toBe("203.0.113.7");
  });

  it("refuses a user who is not an active manager of the organisation the agreement is with, and records nothing", async () => {
    const clientAgreement = await publishAgreement(rig.deps(), rig.actor, base());
    const supplierAgreement = await publishAgreement(rig.deps(), rig.actor, base({ party: "supplier" }));
    const halden = userIn(rig, rig.world().halden);
    await setMemberRole(rig, halden.id, "manager");
    await setMemberRole(rig, supplierUser().id, "manager");
    const asSigner = (agreementId: string, userId: string) => refusal(recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId, userId }));
    // The client's user is a plain member; another client's manager; the supplier's manager on the client agreement; the client's manager on the supplier agreement.
    expect((await asSigner(clientAgreement.id, clientUser().id)).code).toBe("not-an-agreement-signer");
    expect((await asSigner(clientAgreement.id, halden.id)).code).toBe("not-an-agreement-signer");
    expect((await asSigner(clientAgreement.id, supplierUser().id)).code).toBe("not-an-agreement-signer");
    await setMemberRole(rig, clientUser().id, "manager");
    expect((await asSigner(supplierAgreement.id, clientUser().id)).code).toBe("not-an-agreement-signer");
    // A suspended manager, and a Fynix user.
    await rig.dbs.owner.db.update(member).set({ status: "suspended" }).where(eq(member.userId, clientUser().id));
    expect((await asSigner(clientAgreement.id, clientUser().id)).code).toBe("not-an-agreement-signer");
    expect((await asSigner(clientAgreement.id, rig.actor.userId)).code).toBe("not-an-agreement-signer");
    expect(await acceptances()).toEqual([]);
    expect(await auditRowsFor(rig, "agreement.accept")).toEqual([]);
  });

  it("refuses a superseded version, a second acceptance by the same person, an unknown agreement and an unknown user", async () => {
    await setMemberRole(rig, clientUser().id, "manager");
    const first = await publishAgreement(rig.deps(), rig.actor, base());
    const second = await publishAgreement(rig.deps(), rig.actor, base({ monthlyTarget: 25 }));
    expect((await refusal(recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: first.id, userId: clientUser().id }))).code).toBe("agreement-superseded");
    await recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: second.id, userId: clientUser().id });
    expect((await refusal(recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: second.id, userId: clientUser().id }))).code).toBe("already-accepted");
    expect((await refusal(recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: UNKNOWN, userId: clientUser().id }))).code).toBe("not-found");
    expect((await refusal(recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: second.id, userId: UNKNOWN }))).code).toBe("not-an-agreement-signer");
    expect(await acceptances()).toHaveLength(1);
  });

  it("asks the next version to be accepted again: an acceptance belongs to the version it was given for", async () => {
    await setMemberRole(rig, clientUser().id, "manager");
    const first = await publishAgreement(rig.deps(), rig.actor, base());
    await recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: first.id, userId: clientUser().id });
    const second = await publishAgreement(rig.deps(), rig.actor, base({ monthlyTarget: 30 }));
    const read = await readAgreements(rig.deps(), rig.actor, firstCampaign(rig).id);
    expect(read.client.current?.id).toBe(second.id);
    expect(read.client.current?.acceptances).toEqual([]);
    expect(read.client.history[0]?.acceptances).toHaveLength(1);
  });

  it("refuses a malformed input and an empty network address, and is refused to Fynix staff", async () => {
    const published = await publishAgreement(rig.deps(), rig.actor, base());
    expect((await refusal(recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: "nope", userId: clientUser().id }))).code).toBe("invalid-input");
    expect((await refusal(recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: published.id, userId: clientUser().id, networkAddress: "" }))).code).toBe("invalid-input");
    expect((await refusal(recordAgreementAcceptance(rig.deps(), rig.staffActor, { agreementId: published.id, userId: clientUser().id }))).code).toBe("admin-required");
    expect(await acceptances()).toEqual([]);
  });
});
