import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { consumeRateLimit, firstBlockedLimit, keyHashFor, purgeStaleRateLimits } from "@/server/auth/rate-limit";
import { rateLimit } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import { openTestDatabases, resetDatabase, type TestDatabases } from "@/server/db/testing";

/** The Postgres rate limits, on the real test database, as `leads_public`. */

let dbs: TestDatabases;
const NOW = new Date("2026-12-01T09:07:30Z");
const RULE = { limit: 3, windowSeconds: 900 } as const;

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetDatabase(dbs.owner);
});

const publicDb = () => dbs.roles.leads_public.db;
const rows = () => dbs.owner.db.select().from(rateLimit);

describe("consumeRateLimit", () => {
  it("allows up to the limit, counts down, then blocks and says how long until the window ends", async () => {
    const results = [];
    for (let hit = 0; hit < 5; hit += 1) results.push(await consumeRateLimit(publicDb(), "k", RULE, NOW));
    expect(results.map((result) => result.allowed)).toEqual([true, true, true, false, false]);
    expect(results.map((result) => result.remaining)).toEqual([2, 1, 0, 0, 0]);
    // 09:07:30 is 450 seconds into the 09:00 window of 900 seconds.
    expect(results[3]?.retryAfterSeconds).toBe(450);
  });

  it("starts a new window afterwards and removes the key's older window", async () => {
    for (let hit = 0; hit < 4; hit += 1) await consumeRateLimit(publicDb(), "k", RULE, NOW);
    const later = new Date(NOW.getTime() + 900_000);
    expect((await consumeRateLimit(publicDb(), "k", RULE, later)).allowed).toBe(true);
    expect(await rows()).toHaveLength(1);
  });

  it("keeps keys apart", async () => {
    for (let hit = 0; hit < 4; hit += 1) await consumeRateLimit(publicDb(), "a", RULE, NOW);
    expect((await consumeRateLimit(publicDb(), "b", RULE, NOW)).allowed).toBe(true);
  });

  it("stores a hash of the key: no email address and no network address", async () => {
    await consumeRateLimit(publicDb(), "sign-in:account-network:pat@example.com:203.0.113.9", RULE, NOW);
    const stored = await rows();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.keyHash).toBe(keyHashFor("sign-in:account-network:pat@example.com:203.0.113.9"));
    expect(stored[0]?.keyHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(stored)).not.toContain("pat@example.com");
    expect(JSON.stringify(stored)).not.toContain("203.0.113.9");
  });

  it("counts concurrent hits exactly", async () => {
    const results = await Promise.all(Array.from({ length: 40 }, () => consumeRateLimit(publicDb(), "busy", { limit: 10, windowSeconds: 900 }, NOW)));
    expect(results.filter((result) => result.allowed)).toHaveLength(10);
    expect((await rows())[0]?.count).toBe(40);
  });

  it("refuses an empty key, a bad rule and an invalid time", async () => {
    await expect(consumeRateLimit(publicDb(), " ", RULE, NOW)).rejects.toThrow("must not be empty");
    await expect(consumeRateLimit(publicDb(), "k", { limit: 0, windowSeconds: 60 }, NOW)).rejects.toThrow("positive whole number");
    await expect(consumeRateLimit(publicDb(), "k", { limit: 1, windowSeconds: 1.5 }, NOW)).rejects.toThrow("whole number of seconds");
    await expect(consumeRateLimit(publicDb(), "k", RULE, new Date(Number.NaN))).rejects.toThrow("valid Date");
  });

  it("is committed on the spot: it runs on the pool, outside any transaction, so a rolled-back request cannot take a hit back", async () => {
    class Rollback extends Error {}
    await dbs.roles.leads_public.db
      .transaction(async () => {
        await consumeRateLimit(publicDb(), "k", RULE, NOW);
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
    expect(await rows()).toHaveLength(1);
  });

  it("cannot be handed a transaction: the compiler refuses it", () => {
    const compileOnly = (tx: ScopedTransaction): unknown =>
      // @ts-expect-error A transaction is not a Database. Rate limits run outside any transaction (see consumeRateLimit).
      consumeRateLimit(tx, "k", RULE, NOW);
    expect(compileOnly).toBeTypeOf("function");
  });
});

describe("firstBlockedLimit", () => {
  it("stops at the first block and does not touch the later keys", async () => {
    const checks = [
      { key: "one", rule: { limit: 1, windowSeconds: 900 } },
      { key: "two", rule: { limit: 1, windowSeconds: 900 } },
    ];
    expect(await firstBlockedLimit(publicDb(), checks, NOW)).toBeNull();
    const blocked = await firstBlockedLimit(publicDb(), checks, NOW);
    expect(blocked?.allowed).toBe(false);
    const counts = Object.fromEntries((await rows()).map((row) => [row.keyHash, row.count]));
    expect(counts[keyHashFor("one")]).toBe(2);
    expect(counts[keyHashFor("two")]).toBe(1);
  });
});

describe("purgeStaleRateLimits", () => {
  it("removes windows that ended before the cut-off, whichever key, and reports how many", async () => {
    await consumeRateLimit(publicDb(), "old", RULE, new Date("2026-11-01T00:00:00Z"));
    await consumeRateLimit(publicDb(), "recent", RULE, NOW);
    expect(await purgeStaleRateLimits(publicDb(), new Date("2026-12-01T00:00:00Z"))).toBe(1);
    expect((await rows()).map((row) => row.keyHash)).toEqual([keyHashFor("recent")]);
  });
});
