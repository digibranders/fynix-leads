import { runRolesSetup } from "@/server/db/provision";
import { ROLE_NAMES, passwordVariable, type RoleName } from "@/server/db/roles";
import { getToolingEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { runScript } from "@/server/run-script";

runScript(async () => {
  loadEnvLocal();
  const env = getToolingEnv();
  const passwords = Object.fromEntries(ROLE_NAMES.map((role) => [role, env[passwordVariable(role)]])) as Record<RoleName, string>;
  await runRolesSetup(env.DATABASE_URL_ADMIN, passwords);
});
