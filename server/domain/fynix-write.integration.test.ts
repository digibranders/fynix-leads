import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, member, organisation } from "@/server/db/schema";
import { captureErrorText, queryAs } from "@/server/db/testing";
import { DomainError } from "@/server/domain/errors";
import { fynixRead, fynixWrite } from "@/server/domain/fynix-write";
import { openDomainRig } from "@/server/domain/testing";

/** The Fynix write helper: the scope, the audit row in the same transaction, and the rule that a change cannot commit without one. */

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

const auditRows = () => rig.dbs.owner.db.select().from(auditLog);
const refs = async (): Promise<string[]> => (await rig.dbs.owner.db.select({ ref: organisation.publicRef }).from(organisation)).map((row) => row.ref);
const NEW = { publicRef: "ORG-3C4D", kind: "agency", name: "Ridgeway Ltd" } as const;

describe("fynixWrite", () => {
  it("writes the change and its audit row together, in the admin's name and as the Fynix role", async () => {
    const created = await fynixWrite(rig.dbs.roles.leads_fynix.db, rig.actor, async ({ tx, audit }) => {
      const [row] = await tx.insert(organisation).values(NEW).returning({ id: organisation.id });
      if (row === undefined) throw new Error("no row");
      await audit({ action: "organisation.create", subject: { table: "organisation", id: row.id, ref: NEW.publicRef }, before: null, after: { ref: NEW.publicRef, name: NEW.name } });
      return row.id;
    });
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorUserId: rig.actor.userId,
      actorRole: "leads_fynix",
      action: "organisation.create",
      subjectTable: "organisation",
      subjectId: created,
      subjectRef: "ORG-3C4D",
      before: null,
      after: { ref: "ORG-3C4D", name: "Ridgeway Ltd" },
    });
    expect(rows[0]?.at).toBeInstanceOf(Date);
    expect(await refs()).toContain("ORG-3C4D");
  });

  it("rolls back the audit row with the change when the work fails", async () => {
    const message = await captureErrorText(
      fynixWrite(rig.dbs.roles.leads_fynix.db, rig.actor, async ({ tx, audit }) => {
        await tx.insert(organisation).values(NEW);
        await audit({ action: "organisation.create", subject: { table: "organisation", id: rig.actor.userId } });
        throw new Error("the work failed after the audit row");
      }),
    );
    expect(message).toContain("the work failed after the audit row");
    expect(await auditRows()).toEqual([]);
    expect(await refs()).not.toContain("ORG-3C4D");
  });

  it("cannot commit a change that has no audit row, and leaves nothing behind", async () => {
    const message = await captureErrorText(fynixWrite(rig.dbs.roles.leads_fynix.db, rig.actor, async ({ tx }) => void (await tx.insert(organisation).values(NEW))));
    expect(message).toContain("A change to organisation by Fynix has no audit_log row in its transaction");
    expect(await auditRows()).toEqual([]);
    expect(await refs()).not.toContain("ORG-3C4D");
  });

  it("accepts several audit rows for one transaction, each with its own subject", async () => {
    await fynixWrite(rig.dbs.roles.leads_fynix.db, rig.actor, async ({ tx, audit }) => {
      await tx.update(organisation).set({ name: "Renamed Ltd" }).where(eq(organisation.publicRef, "ORG-4K9P"));
      await audit({ action: "organisation.update", subject: { table: "organisation", id: rig.actor.userId, ref: "ORG-4K9P" } });
      await audit({ action: "organisation.update", subject: { table: "organisation", id: rig.actor.userId, ref: "ORG-8H3D" } });
    });
    expect((await auditRows()).map((row) => row.subjectRef).sort()).toEqual(["ORG-4K9P", "ORG-8H3D"]);
  });

  it("refuses an actor who is not a UUID before it opens a transaction", async () => {
    await expect(fynixWrite(rig.dbs.roles.leads_fynix.db, { userId: "not-a-uuid" }, async () => 1)).rejects.toThrow("userId must be a UUID");
  });
});

describe("the actor must be an active Fynix member", () => {
  const writeAs = (userId: string) =>
    fynixWrite(rig.dbs.roles.leads_fynix.db, { userId }, async ({ tx, audit }) => {
      await tx.insert(organisation).values(NEW);
      await audit({ action: "organisation.create", subject: { table: "organisation", id: userId, ref: NEW.publicRef } });
    });
  const clientUserId = (): string => {
    const person = rig.world().users.find((candidate) => candidate.organisation.kind === "client");
    if (person === undefined) throw new Error("no client user");
    return person.id;
  };
  const refused = async (userId: string): Promise<void> => {
    const error = await writeAs(userId).then(
      () => null,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe("not-authorised");
    expect(await auditRows()).toEqual([]);
    expect(await refs()).not.toContain(NEW.publicRef);
  };

  it("refuses the user of a client organisation", async () => {
    await refused(clientUserId());
  });

  it("refuses a suspended Fynix member", async () => {
    await rig.dbs.owner.db.update(member).set({ status: "suspended" }).where(eq(member.userId, rig.actor.userId));
    await refused(rig.actor.userId);
  });

  it("refuses an id that belongs to no user", async () => {
    await refused("6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f");
  });

  it("still lets an active Fynix member write", async () => {
    await writeAs(rig.actor.userId);
    expect(await refs()).toContain(NEW.publicRef);
    expect(await auditRows()).toHaveLength(1);
  });

  it("is enforced by the audit policy too, for a caller that skips the service", async () => {
    const insert = (userId: string) =>
      queryAs(rig.dbs.roles.leads_fynix.db, { orgId: null, userId }, `insert into audit_log (action, subject_table, subject_id) values ('organisation.create', 'organisation', '${userId}')`);
    await expect(captureErrorText(insert(clientUserId()))).resolves.toContain("row-level security");
    await rig.dbs.owner.db.update(member).set({ status: "suspended" }).where(eq(member.userId, rig.actor.userId));
    await expect(captureErrorText(insert(rig.actor.userId))).resolves.toContain("row-level security");
    expect(await auditRows()).toEqual([]);
  });
});

describe("fynixRead", () => {
  it("reads with the Fynix scope and appends nothing", async () => {
    const rows = await fynixRead(rig.dbs.roles.leads_fynix.db, rig.actor, (tx) => tx.select({ ref: organisation.publicRef }).from(organisation));
    expect(rows).toHaveLength(5);
    expect(await auditRows()).toEqual([]);
  });
});
