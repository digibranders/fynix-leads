import { runDatabaseSetup } from "@/server/db/provision";
import { getToolingEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { runScript } from "@/server/run-script";

runScript(async () => {
  loadEnvLocal();
  await runDatabaseSetup(getToolingEnv().DATABASE_URL_ADMIN);
});
