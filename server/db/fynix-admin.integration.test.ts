import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, member, organisation } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { captureErrorText, openTestDatabases, resetDatabase, type TestDatabases } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";
import { AUDIT_EXEMPT_TABLES, fynixWritableTables, fynixWritableTablesWithoutAdminTrigger, quoteIdentifier } from "@/server/db/testing/structure";

/**
 * The database side of the Fynix admin rule (migration 0029): a change to a table Fynix writes, made as `leads_fynix` by anyone
 * who is not an active manager of the Fynix organisation, is refused, whatever the service did or did not check. The service
 * side (`admin-required`) is tested in server/domain/fynix-write.integration.test.ts and admin-only.integration.test.ts.
 */

let dbs: TestDatabases;
let world: SeedWorld;

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetDatabase(dbs.owner);
  world = await seedWorld(dbs.owner);
});

const REFUSED = "Only a Fynix admin may change organisation";

function person(predicate: (candidate: SeedWorld["users"][number]) => boolean, what: string): string {
  const found = world.users.find(predicate);
  if (found === undefined) throw new Error(`The seed world has no ${what}`);
  return found.id;
}
const admin = (): string => person((candidate) => candidate.organisation.kind === "fynix" && candidate.role === "manager", "Fynix admin");
const staff = (): string => person((candidate) => candidate.organisation.kind === "fynix" && candidate.role === "member", "Fynix staff member");
const clientUser = (): string => person((candidate) => candidate.organisation.kind === "client", "client user");

/** A complete Fynix change with its audit row, so the only thing that can refuse it is the admin rule. */
async function createAs(userId: string): Promise<void> {
  await withScope(dbs.roles.leads_fynix.db, { orgId: null, userId }, async (tx) => {
    await tx.insert(organisation).values({ publicRef: "ORG-3C4D", kind: "agency", name: "Ridgeway Ltd" });
    await tx.insert(auditLog).values({ action: "organisation.create", subjectTable: "organisation", subjectId: userId });
  });
}
const organisationCount = async (): Promise<number> => (await dbs.owner.db.select({ id: organisation.id }).from(organisation)).length;

/**
 * Tables Fynix writes that are not set-up: they carry the audit trigger but deliberately no fynix_admin_required trigger, so staff may
 * write them at the database level. The domain layer (fynixWrite) is what keeps staff out of lead, meeting, message and notification
 * changes that only an admin may make; the database does not.
 */
const NOT_SET_UP_TABLES: readonly string[] = ["lead", "lead_history", "meeting", "conversation", "conversation_message", "notification"];

// The table list comes from the catalog when the file loads, so a table added later is covered without anyone listing it.
const writableTables = await (async () => {
  const handles = openTestDatabases();
  try {
    return await fynixWritableTables(handles.owner.db, [...AUDIT_EXEMPT_TABLES, ...NOT_SET_UP_TABLES]);
  } finally {
    await handles.closeAll();
  }
})();

describe("the Fynix admin trigger", () => {
  it("covers the tables Fynix writes", () => {
    expect(writableTables.length).toBeGreaterThan(0);
  });

  it.each(writableTables.map((entry) => [entry.table, entry] as const))("refuses staff on %s for each insert, update and delete it may run that touches no row", async (_name, entry) => {
    const table = quoteIdentifier(entry.table);
    const statements: string[] = [];
    if (entry.canDelete) statements.push(`delete from ${table} where false`);
    if (entry.insertColumn !== null) statements.push(`insert into ${table} (${quoteIdentifier(entry.insertColumn)}) select ${quoteIdentifier(entry.insertColumn)} from ${table} where false`);
    if (entry.updateColumn !== null) statements.push(`update ${table} set ${quoteIdentifier(entry.updateColumn)} = ${quoteIdentifier(entry.updateColumn)} where false`);
    expect(statements.length, `leads_fynix can write nothing in ${entry.table}`).toBeGreaterThan(0);
    for (const statement of statements) {
      const message = await captureErrorText(withScope(dbs.roles.leads_fynix.db, { orgId: null, userId: staff() }, (tx) => tx.execute(sql.raw(statement))));
      expect(message, statement).toContain(`Only a Fynix admin may change ${entry.table}`);
    }
  });

  it("lets an active manager of the Fynix organisation write", async () => {
    await createAs(admin());
    expect(await organisationCount()).toBe(6);
  });

  it("refuses Fynix staff, and nothing is left behind", async () => {
    expect(await captureErrorText(createAs(staff()))).toContain(REFUSED);
    expect(await organisationCount()).toBe(5);
  });

  it("refuses staff even for a statement that would change no row", async () => {
    const message = await captureErrorText(withScope(dbs.roles.leads_fynix.db, { orgId: null, userId: staff() }, (tx) => tx.update(organisation).set({ name: "x" }).where(eq(organisation.name, "no such name"))));
    expect(message).toContain(REFUSED);
  });

  it("lets staff read", async () => {
    const rows = await withScope(dbs.roles.leads_fynix.db, { orgId: null, userId: staff() }, (tx) => tx.select({ id: organisation.id }).from(organisation));
    expect(rows).toHaveLength(5);
  });

  it("refuses a suspended admin", async () => {
    await dbs.owner.db.update(member).set({ status: "suspended" }).where(eq(member.userId, admin()));
    expect(await captureErrorText(createAs(admin()))).toContain(REFUSED);
  });

  it("refuses a manager of a client organisation: the role must be held in the Fynix organisation", async () => {
    await dbs.owner.db.update(member).set({ role: "manager" }).where(eq(member.userId, clientUser()));
    expect(await captureErrorText(createAs(clientUser()))).toContain(REFUSED);
  });

  it("refuses a user id that belongs to nobody", async () => {
    expect(await captureErrorText(createAs("99999999-9999-4999-8999-999999999999"))).toContain(REFUSED);
  });

  it("is on every set-up table Fynix can write, apart from the audit log, the outbox and the work tables", async () => {
    expect(await fynixWritableTablesWithoutAdminTrigger(dbs.owner.db, [...AUDIT_EXEMPT_TABLES, ...NOT_SET_UP_TABLES])).toEqual([]);
  });
});
