import { parseArgs } from "node:util";
import { breachCheckerFor } from "@/server/auth/breach-check";
import { createAuth } from "@/server/auth/create-auth";
import { authErrorCode, authErrorMessage } from "@/server/auth/errors";
import { captureResetToken, NoSuchAccountError, setAccountPassword } from "@/server/auth/set-password";
import { createDatabase } from "@/server/db/pool";
import { getEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { readHiddenLine } from "@/server/prompt";
import { runScript } from "@/server/run-script";

// Sets the password of an existing account (Fynix, client or agency) and ends all of its sessions. Never a public route.
// The password is read from the terminal without echo, or from the first line of standard input, never from an argument.
// It needs only the runtime environment: it connects as leads_auth like the app does, never as the owner.
runScript(async () => {
  const { values } = parseArgs({ options: { email: { type: "string" } } });
  if (values.email === undefined) {
    throw new Error("Usage: pnpm password:set --email=<address>\nThe password is asked for, or read from the first line of standard input.");
  }

  loadEnvLocal();
  const env = getEnv();

  const password = await readHiddenLine("New password: ");
  if (process.stdin.isTTY && (await readHiddenLine("Repeat the new password: ")) !== password) throw new Error("The two passwords are not the same. Nothing was changed.");

  const authDb = createDatabase(env.DATABASE_URL_AUTH, { max: 2 });
  try {
    const capture = captureResetToken();
    const auth = createAuth({ db: authDb.db, secret: env.BETTER_AUTH_SECRET, baseURL: env.APP_ORIGIN, breachChecker: breachCheckerFor(env.PASSWORD_BREACH_CHECK), mailer: capture.mailer, nextCookies: false });
    const changed = await setAccountPassword({ auth, capture }, { email: values.email, newPassword: password });
    console.log(`Changed the password of ${changed.email}. Every session of that account has ended; they sign in again at ${env.APP_ORIGIN}/sign-in.`);
  } catch (error) {
    if (error instanceof NoSuchAccountError) throw new Error(`${error.message} Nothing was changed.`);
    if (authErrorCode(error) !== undefined) throw new Error(`${authErrorMessage(error) ?? "The password was refused."} Nothing was changed.`);
    throw error;
  } finally {
    await authDb.close();
  }
});
