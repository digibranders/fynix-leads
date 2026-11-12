import { count } from "drizzle-orm";
import { createDatabase } from "@/server/db/pool";
import { organisation } from "@/server/db/schema";
import { seedWorld } from "@/server/db/testing/seed";
import { getToolingEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { runScript } from "@/server/run-script";

// Fills the dev database with the same two clients, two agencies and four campaigns the tests use, so the screens
// have something to show. It never overwrites: it refuses a database that already holds an organisation.
runScript(async () => {
  loadEnvLocal();
  const owner = createDatabase(getToolingEnv().DATABASE_URL_OWNER, { max: 1 });
  try {
    const existing = await owner.db.select({ n: count() }).from(organisation);
    if ((existing[0]?.n ?? 0) > 0) throw new Error("The dev database already holds organisations, so nothing was seeded.");
    const world = await seedWorld(owner, { withDomain: false });
    console.log(`Seeded ${world.clients.length} clients, ${world.agencies.length} agencies and ${world.campaigns.length} campaigns.`);
  } finally {
    await owner.close();
  }
});
