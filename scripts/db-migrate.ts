import { join } from "node:path";
import { parseArgs } from "node:util";
import { Pool } from "pg";
import { assertReadyToMigrate } from "@/server/db/migrate-guards";
import { runMigrations } from "@/server/db/migrator";
import { getToolingEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { runScript } from "@/server/run-script";

runScript(async () => {
  const { values } = parseArgs({ options: { target: { type: "string" }, "stop-after": { type: "string" } } });
  const target = values.target ?? "dev";
  if (target !== "dev" && target !== "test") {
    throw new Error(`--target must be "dev" or "test", received ${JSON.stringify(values.target)}`);
  }

  loadEnvLocal();
  const env = getToolingEnv();
  const pool = new Pool({ connectionString: target === "dev" ? env.DATABASE_URL_OWNER : env.DATABASE_URL_OWNER_TEST, max: 1 });
  try {
    await assertReadyToMigrate(pool);
    // Not drizzle-orm's migrate(): it applies every pending migration in one transaction. See server/db/migrator.ts.
    await runMigrations(pool, join(process.cwd(), "server/db/migrations"), { stopAfter: values["stop-after"] });
    console.log(`Migrations applied to the ${target} database${values["stop-after"] ? `, stopping after ${values["stop-after"]}` : ""}.`);
  } finally {
    await pool.end();
  }
});
