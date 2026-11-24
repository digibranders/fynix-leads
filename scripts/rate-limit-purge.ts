import { createDatabase } from "@/server/db/pool";
import { purgeStaleRateLimits } from "@/server/auth/rate-limit";
import { getEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { runScript } from "@/server/run-script";

// Removes rate limit rows whose window ended more than a day ago, as the leads_public role. consumeRateLimit only cleans a
// key that is seen again, so keys that never return would stay forever. Run it daily from cron or a timer (docs/deploy.md).
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

runScript(async () => {
  loadEnvLocal();
  const env = getEnv();
  const handle = createDatabase(env.DATABASE_URL_PUBLIC, { max: 1 });
  try {
    const removed = await purgeStaleRateLimits(handle.db, new Date(Date.now() - ONE_DAY_MS));
    console.log(`Rate limit purge: ${removed} rows removed.`);
  } finally {
    await handle.close();
  }
});
