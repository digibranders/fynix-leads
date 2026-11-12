import { existsSync } from "node:fs";
import { join } from "node:path";

export const ENV_FILE_NAME = ".env.local";

/**
 * Loads `.env.local` from the repository root into `process.env`, for scripts and tests. Next.js loads the same
 * file for the app on its own. Variables already set in the shell win, which is how CI overrides them.
 */
export function loadEnvLocal(directory: string = process.cwd()): void {
  const path = join(directory, ENV_FILE_NAME);
  if (!existsSync(path)) {
    throw new Error(`${path} does not exist. Run "pnpm env:init" to create it.`);
  }
  process.loadEnvFile(path);
}
