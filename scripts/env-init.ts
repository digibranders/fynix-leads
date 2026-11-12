import { userInfo } from "node:os";
import { join } from "node:path";
import { ENV_FILE_NAME } from "@/server/env-file";
import { EnvFileExistsError, buildEnvFile, generateSecrets, writeEnvFileOnce } from "@/server/env-init";
import { runScript } from "@/server/run-script";

runScript(async () => {
  const path = join(process.cwd(), ENV_FILE_NAME);
  try {
    writeEnvFileOnce(path, buildEnvFile(generateSecrets(userInfo().username)));
  } catch (error) {
    if (error instanceof EnvFileExistsError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
  console.log(`Wrote ${path} (mode 600). Next: pnpm db:roles, pnpm db:create, pnpm db:migrate.`);
});
