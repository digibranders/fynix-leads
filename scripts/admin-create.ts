import { parseArgs } from "node:util";
import { createFynixAdmin } from "@/server/auth/admin-create";
import { breachCheckerFor } from "@/server/auth/breach-check";
import { AccountAlreadyExistsError } from "@/server/auth/create-account";
import { createAuth } from "@/server/auth/create-auth";
import { authErrorCode, authErrorMessage } from "@/server/auth/errors";
import { createDatabase } from "@/server/db/pool";
import { getEnv, getToolingEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { readHiddenLine } from "@/server/prompt";
import { runScript } from "@/server/run-script";

// Creates a Fynix admin: the account, and a membership in the Fynix organisation (made if it does not exist yet).
// Never a public route. Password only for now (decision D3); gate G1 adds a second factor, see server/auth/second-factor.ts.
// The password is read from the terminal without echo, or from the first line of standard input, never from an argument.
runScript(async () => {
  const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" } } });
  if (values.email === undefined || values.name === undefined) {
    throw new Error('Usage: pnpm admin:create --email=<address> --name="<full name>"\nThe password is asked for, or read from the first line of standard input.');
  }

  loadEnvLocal();
  const env = getEnv();
  const tooling = getToolingEnv();

  const password = await readHiddenLine("Password: ");
  if (process.stdin.isTTY && (await readHiddenLine("Repeat the password: ")) !== password) throw new Error("The two passwords are not the same. Nothing was created.");

  const authDb = createDatabase(env.DATABASE_URL_AUTH, { max: 2 });
  const ownerDb = createDatabase(tooling.DATABASE_URL_OWNER, { max: 1 });
  try {
    const auth = createAuth({
      db: authDb.db,
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.APP_ORIGIN,
      breachChecker: breachCheckerFor(env.PASSWORD_BREACH_CHECK),
      // This script never asks for a reset, so it never sends anything.
      mailer: { sendPasswordReset: () => Promise.reject(new Error("admin:create sends no email")) },
      nextCookies: false,
    });
    const created = await createFynixAdmin({ auth, authDb: authDb.db, ownerDb: ownerDb.db }, { email: values.email, name: values.name, password });
    console.log(`Created the Fynix admin ${created.email}. Sign in at ${env.APP_ORIGIN}/sign-in.`);
  } catch (error) {
    if (error instanceof AccountAlreadyExistsError) throw new Error(`${error.message} Nothing was changed.`);
    if (authErrorCode(error) !== undefined) throw new Error(`${authErrorMessage(error) ?? "The account was refused."} Nothing was created.`);
    throw error;
  } finally {
    await Promise.all([authDb.close(), ownerDb.close()]);
  }
});
