import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { signInChecks } from "@/lib/auth/rate-limit-rules";
import { keyHashFor } from "@/server/auth/rate-limit";
import { signInWithPassword } from "@/server/auth/sign-in";
import { GOOD_PASSWORD, createUserIn, openAuthRig, type AuthRig } from "@/server/auth/testing";
import { rateLimit } from "@/server/db/schema";
import { resetDatabase } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";

/** The sign-in service against the real Postgres rate limits: the clock is frozen at 09:07:30 so the window is known. */

let rig: AuthRig;
let world: SeedWorld;
const NOW = new Date("2026-12-01T09:07:30Z");

beforeAll(() => {
  rig = openAuthRig({ now: () => NOW });
});
afterAll(async () => {
  await rig?.close();
});
beforeEach(async () => {
  await resetDatabase(rig.dbs.owner);
  world = await seedWorld(rig.dbs.owner, { withUsers: false });
});

const rows = () => rig.dbs.owner.db.select().from(rateLimit);

describe("sign-in is rate limited", () => {
  const ADDRESS = "203.0.113.50";

  it("blocks the ninth attempt from one network for one account, even with the right password, and not another network", async () => {
    await createUserIn(rig, world.kestrel, { email: "client@kestrel.example" });
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const wrong = await signInWithPassword(rig.services, { email: "client@kestrel.example", password: "wrong-password-entirely", address: ADDRESS });
      expect(wrong.status, `attempt ${attempt}`).toBe("invalid-credentials");
    }
    const blocked = await signInWithPassword(rig.services, { email: "client@kestrel.example", password: GOOD_PASSWORD, address: ADDRESS });
    expect(blocked).toEqual({ status: "rate-limited", retryAfterSeconds: 450 });

    const elsewhere = await signInWithPassword(rig.services, { email: "client@kestrel.example", password: GOOD_PASSWORD, address: "198.51.100.77" });
    expect(elsewhere.status).toBe("signed-in");
  });

  it("blocks a network that tries many accounts after 20 attempts", async () => {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const result = await signInWithPassword(rig.services, { email: `user${attempt}@example.com`, password: "wrong-password-entirely", address: ADDRESS });
      expect(result.status).toBe("invalid-credentials");
    }
    expect((await signInWithPassword(rig.services, { email: "user21@example.com", password: "x", address: ADDRESS })).status).toBe("rate-limited");
  });

  it("counts a successful sign-in too, and uses the three keys the rules name", async () => {
    await createUserIn(rig, world.kestrel, { email: "client@kestrel.example" });
    await signInWithPassword(rig.services, { email: "Client@Kestrel.example", password: GOOD_PASSWORD, address: ADDRESS });
    const stored = (await rows()).map((row) => row.keyHash).sort();
    expect(stored).toEqual(signInChecks("client@kestrel.example", ADDRESS).map((check) => keyHashFor(check.key)).sort());
  });

  it("fails closed: when the limiter cannot run, nobody signs in", async () => {
    await createUserIn(rig, world.kestrel, { email: "client@kestrel.example" });
    const broken = { ...rig.services, publicDb: rig.dbs.roles.leads_client.db };
    await expect(signInWithPassword(broken, { email: "client@kestrel.example", password: GOOD_PASSWORD, address: ADDRESS })).rejects.toThrow();
  });
});
