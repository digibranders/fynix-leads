import { createHash } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import type { RateLimitCheck, RateLimitRule } from "@/lib/auth/rate-limit-rules";
import type { Database } from "@/server/db/pool";
import { rateLimit } from "@/server/db/schema";

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  /** Seconds until the window ends; 0 when the hit was allowed. */
  readonly retryAfterSeconds: number;
}

export function assertValidRule(rule: RateLimitRule): void {
  if (!Number.isSafeInteger(rule.limit) || rule.limit < 1) throw new RangeError(`A rate limit must be a positive whole number, received ${rule.limit}`);
  if (!Number.isSafeInteger(rule.windowSeconds) || rule.windowSeconds < 1) {
    throw new RangeError(`A rate limit window must be a positive whole number of seconds, received ${rule.windowSeconds}`);
  }
}

/** The start of the fixed window that contains `now`. Windows are aligned to the epoch, so every instance agrees on them. */
export function windowStartFor(now: Date, windowSeconds: number): Date {
  const windowMs = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

/** What is stored for a key: 43 characters, and no email address or network address. */
export function keyHashFor(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("base64url");
}

/**
 * Records one hit for `key` and says whether it is within the rule. The upsert is one statement, so concurrent hits are
 * counted exactly. Fixed windows allow up to twice the limit across a window boundary; these limits are a brake, not a
 * quota.
 *
 * Call it with the `leads_public` database and outside any transaction: inside one, the row lock on a busy key would be
 * held until the transaction ends, and a rolled-back request would take its hit back. A failure propagates: callers fail
 * closed rather than skip the limit.
 */
export async function consumeRateLimit(db: Database, key: string, rule: RateLimitRule, now: Date = new Date()): Promise<RateLimitResult> {
  if (key.trim() === "") throw new RangeError("A rate limit key must not be empty");
  if (!Number.isFinite(now.getTime())) throw new RangeError("The rate limit time must be a valid Date");
  assertValidRule(rule);

  const keyHash = keyHashFor(key);
  const windowStart = windowStartFor(now, rule.windowSeconds);
  const rows = await db
    .insert(rateLimit)
    .values({ keyHash, windowStart, count: 1 })
    .onConflictDoUpdate({ target: [rateLimit.keyHash, rateLimit.windowStart], set: { count: sql`${rateLimit.count} + 1` } })
    .returning({ count: rateLimit.count });
  const hits = rows[0]?.count;
  if (hits === undefined) throw new Error("The rate limit upsert returned no row");

  // Older windows of this key are dead weight: keep one row per key.
  await db.delete(rateLimit).where(and(eq(rateLimit.keyHash, keyHash), lt(rateLimit.windowStart, windowStart)));

  if (hits <= rule.limit) return { allowed: true, remaining: rule.limit - hits, retryAfterSeconds: 0 };
  const windowEndMs = windowStart.getTime() + rule.windowSeconds * 1000;
  return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((windowEndMs - now.getTime()) / 1000) };
}

/**
 * Consumes each check in order and returns the first block, or `null` when every one allows the hit. Stopping at the
 * first block means a blocked network stops adding rows for the other keys.
 */
export async function firstBlockedLimit(db: Database, checks: readonly RateLimitCheck[], now: Date = new Date()): Promise<RateLimitResult | null> {
  for (const check of checks) {
    const result = await consumeRateLimit(db, check.key, check.rule, now);
    if (!result.allowed) return result;
  }
  return null;
}

/**
 * Removes every window that ended before `olderThan`, whichever key it belongs to: keys that are never seen again
 * leave a row behind that consumeRateLimit never cleans. Returns how many rows went. Phase 6 runs it from the cron
 * endpoint; until then it can be run by hand.
 */
export async function purgeStaleRateLimits(db: Database, olderThan: Date): Promise<number> {
  const removed = await db.delete(rateLimit).where(lt(rateLimit.windowStart, olderThan)).returning({ keyHash: rateLimit.keyHash });
  return removed.length;
}
