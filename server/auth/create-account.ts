import { and, eq } from "drizzle-orm";
import { normaliseEmail } from "@/lib/auth/email";
import { withAccountCreationGrant } from "@/server/auth/account-creation-grant";
import type { AuthDatabase } from "@/server/auth/auth-database";
import type { Auth } from "@/server/auth/create-auth";
import { user } from "@/server/db/schema";

export class AccountAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`An account for ${email} already exists.`);
    this.name = "AccountAlreadyExistsError";
  }
}

export interface NewAccount {
  readonly email: string;
  readonly name: string;
  readonly password: string;
}

export interface CreatedAccount {
  readonly userId: string;
  readonly email: string;
}

/**
 * The only supported way to create an account: inside a grant for that address, then a check that the row exists.
 * Guard 2 of 3 (master plan, section 3): with auto sign-in off, Better Auth answers a sign-up for an address that already
 * has an account with a success and a user id that was never stored. Nobody may rely on that id, so the stored row is
 * read back by id and address before anything is returned. A weak or breached password rejects with Better Auth's
 * error (see server/auth/errors.ts for the codes).
 *
 * `authDb` is the `leads_auth` database or transaction, the same one `auth` runs on.
 */
export async function createAccountWithGrant(auth: Auth, authDb: AuthDatabase, account: NewAccount): Promise<CreatedAccount> {
  const email = normaliseEmail(account.email);
  const result = await withAccountCreationGrant(email, () => auth.api.signUpEmail({ body: { name: account.name, email, password: account.password } }));

  const stored = await authDb
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, result.user.id), eq(user.email, email)))
    .limit(1);
  if (stored.length === 0) throw new AccountAlreadyExistsError(email);
  return { userId: result.user.id, email };
}
