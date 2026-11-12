import { randomFillSync } from "node:crypto";
import { createAuth } from "@/server/auth/create-auth";
import { FakeBreachChecker, TEST_ORIGIN, TEST_SECRET } from "@/server/auth/testing";
import { openTestDatabases, resetDatabase, type TestDatabases } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";
import type { RandomBytes } from "@/lib/domain/public-ref";
import type { DomainDeps } from "@/server/domain/deps";
import type { FynixActor } from "@/server/domain/fynix-write";

/** Test harness for the domain integration tests: the test database, the seeded world, a clock a test can move and a fake breach service. */

const cryptoBytes: RandomBytes = (count) => randomFillSync(new Uint8Array(count));

export interface DomainRig {
  readonly dbs: TestDatabases;
  readonly breach: FakeBreachChecker;
  readonly clock: { now: Date };
  /** The seeded Fynix admin. */
  readonly actor: FynixActor;
  /** Empties the database and seeds the world again (organisations, campaigns and one user each, no phase 1C rows). Call it in `beforeEach`. */
  reset(): Promise<SeedWorld>;
  /** The seeded world as of the last `reset`. */
  world(): SeedWorld;
  deps(overrides?: Partial<DomainDeps>): DomainDeps;
  close(): Promise<void>;
}

export function openDomainRig(): DomainRig {
  const dbs = openTestDatabases();
  const breach = new FakeBreachChecker();
  const clock = { now: new Date() };
  let current: SeedWorld | undefined;
  const world = (): SeedWorld => {
    if (current === undefined) throw new Error("Call rig.reset() before using the world");
    return current;
  };
  return {
    dbs,
    breach,
    clock,
    get actor(): FynixActor {
      const user = world().users[0];
      if (user === undefined) throw new Error("The seed world has no Fynix user");
      return { userId: user.id };
    },
    async reset() {
      await resetDatabase(dbs.owner);
      clock.now = new Date();
      breach.breached.clear();
      breach.unavailable = false;
      current = await seedWorld(dbs.owner, { withDomain: false });
      return current;
    },
    world,
    deps: (overrides = {}) => ({
      fynixDb: dbs.roles.leads_fynix.db,
      authDb: dbs.roles.leads_auth.db,
      publicDb: dbs.roles.leads_public.db,
      now: () => clock.now,
      randomBytes: cryptoBytes,
      origin: TEST_ORIGIN,
      allowPlaceholderTerms: true,
      authFactory: (db) =>
        createAuth({
          db,
          secret: TEST_SECRET,
          baseURL: TEST_ORIGIN,
          breachChecker: breach,
          mailer: { sendPasswordReset: async () => { throw new Error("A reset email is never sent while an invite is redeemed."); } },
          nextCookies: false,
        }),
      ...overrides,
    }),
    close: () => dbs.closeAll(),
  };
}
