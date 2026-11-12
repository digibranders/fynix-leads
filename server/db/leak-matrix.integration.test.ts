import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TENANT_ROLES, type TenantRoleName } from "@/server/db/roles";
import { agencyAlias, auditLog, campaign, emailOutbox, invite, termsAcceptance } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { captureErrorText, openTestDatabases, queryAs, resetDatabase, type TestDatabases } from "@/server/db/testing";
import { PROBES, READ_PATHS, findLeaks, forbiddenTokens, type Viewer } from "@/server/db/testing/leak-matrix";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";

/**
 * Runs the whole matrix: every read path and every probe, as both tenant roles, for both organisations of each kind.
 * What a viewer must not see is computed from the seed (see forbiddenTokens), and the search covers results and
 * error messages alike. The paths and probes live in testing/leak-matrix.ts, so later phases extend the matrix by
 * adding entries there.
 */

let dbs: TestDatabases;
let world: SeedWorld;
const USER = "44444444-4444-4444-8444-444444444444";

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

function viewers(): Viewer[] {
  return [
    ...world.clients.map((organisation): Viewer => ({ role: "leads_client", organisation })),
    ...world.agencies.map((organisation): Viewer => ({ role: "leads_agency", organisation })),
  ];
}

describe.each(TENANT_ROLES)("leak matrix as %s", (role: TenantRoleName) => {
  const label = (viewer: Viewer): string => viewer.organisation.name;

  it.each(READ_PATHS.map((path) => path.name))("read path: %s leaks nothing and is not empty", async (pathName) => {
    const path = READ_PATHS.find((candidate) => candidate.name === pathName);
    if (path === undefined) throw new Error(`Unknown read path ${pathName}`);
    for (const viewer of viewers().filter((candidate) => candidate.role === role)) {
      const result = await withScope(dbs.roles[role].db, { orgId: viewer.organisation.id, userId: USER }, (tx) => path.run(tx, viewer, world));
      const text = JSON.stringify(result);
      expect(findLeaks(text, forbiddenTokens(viewer, world)), `${label(viewer)} saw something it must not`).toEqual([]);
      for (const expected of path.mustContain(viewer, world)) {
        expect(text, `${label(viewer)} should see ${expected}`).toContain(expected);
      }
    }
  });

  it.each(PROBES.map((probe) => probe.name))("probe: %s is denied with a plain permission error", async (probeName) => {
    const probe = PROBES.find((candidate) => candidate.name === probeName);
    if (probe === undefined) throw new Error(`Unknown probe ${probeName}`);
    for (const viewer of viewers().filter((candidate) => candidate.role === role)) {
      const message = await captureErrorText(queryAs(dbs.roles[role].db, { orgId: viewer.organisation.id, userId: USER }, probe.statement));
      expect(message, `${label(viewer)}: ${probe.statement}`).toMatch(probe.expectedError);
      expect(findLeaks(message, forbiddenTokens(viewer, world)), `${label(viewer)} saw something in an error message`).toEqual([]);
    }
  });

  it("each organisation of the kind sees exactly its own campaigns and none of the other's", async () => {
    for (const viewer of viewers().filter((candidate) => candidate.role === role)) {
      const rows = await queryAs(dbs.roles[role].db, { orgId: viewer.organisation.id, userId: USER }, "select public_ref from campaign order by public_ref");
      const expected = world.campaigns.filter((row) => (role === "leads_client" ? row.client : row.agency).id === viewer.organisation.id).map((row) => row.publicRef).sort();
      expect(rows.map((row) => row.public_ref)).toEqual(expected);
      expect(expected).toHaveLength(2);
    }
  });
});

describe("the matrix itself", () => {
  it("detects a leak: what Fynix may read trips the forbidden list of a client and of an agency", async () => {
    const everything = JSON.stringify(await dbs.roles.leads_fynix.db.select().from(campaign));
    const client: Viewer = { role: "leads_client", organisation: world.kestrel };
    const agency: Viewer = { role: "leads_agency", organisation: world.brightpath };
    const clientLeaks = findLeaks(everything, forbiddenTokens(client, world));
    const agencyLeaks = findLeaks(everything, forbiddenTokens(agency, world));
    expect(clientLeaks).toContain(world.brightpath.id);
    expect(clientLeaks).toContain(world.campaigns[1]?.internalNotes);
    expect(agencyLeaks).toContain(world.kestrel.id);
    expect(agencyLeaks).toContain(world.campaigns[2]?.name);
  });

  it("detects a leak of the phase 1C tables: what Fynix may read of invites, aliases, acceptances, the audit log and the outbox trips both forbidden lists", async () => {
    const asFynix = <T>(work: Parameters<typeof withScope<T>>[2]) => withScope(dbs.roles.leads_fynix.db, { orgId: null, userId: world.users[0]?.id ?? USER }, work);
    const everything = JSON.stringify([
      await asFynix((tx) => tx.select({ email: invite.email, name: invite.name }).from(invite)),
      await asFynix((tx) => tx.select({ alias: agencyAlias.alias }).from(agencyAlias)),
      await asFynix((tx) => tx.select({ address: termsAcceptance.networkAddress }).from(termsAcceptance)),
      await asFynix((tx) => tx.select({ before: auditLog.before, after: auditLog.after }).from(auditLog)),
      await asFynix((tx) => tx.select({ recipient: emailOutbox.recipient }).from(emailOutbox)),
    ]);
    const domain = world.domain;
    if (domain === null) throw new Error("The seed world has no phase 1C rows");
    for (const viewer of [{ role: "leads_client", organisation: world.kestrel }, { role: "leads_agency", organisation: world.brightpath }] as const) {
      const leaks = findLeaks(everything, forbiddenTokens(viewer, world));
      for (const expected of [domain.invites[0]?.email, domain.aliases[0], domain.acceptanceAddresses[0], domain.auditMarkers[0], domain.outboxRecipient]) expect(leaks).toContain(expected);
    }
  });
});
