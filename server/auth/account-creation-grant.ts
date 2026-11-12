import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import { normaliseEmail } from "@/lib/auth/email";

interface AccountCreationGrant {
  readonly email: string;
}

const grants = new AsyncLocalStorage<AccountCreationGrant>();
const emailSchema = z.email();

/**
 * Runs `work` with permission to create an account for `email`, and for nothing else. There is no public sign-up: Better
 * Auth's create-user hook (server/auth/create-auth.ts) refuses every account unless it is made inside a grant for that
 * exact address, so a bug or a stray route cannot open an account. Declared `async` so a malformed address rejects the
 * returned promise instead of throwing synchronously.
 */
export async function withAccountCreationGrant<T>(email: string, work: () => Promise<T>): Promise<T> {
  // Validate before lowercasing: the Kelvin sign (U+212A) lowercases to a plain "k", so checking the lowered text would
  // accept an address that looks like another one.
  if (!emailSchema.safeParse(email.trim()).success) throw new Error("Account creation grants need a valid email address.");
  return grants.run({ email: normaliseEmail(email) }, work);
}

export function hasAccountCreationGrant(email: string): boolean {
  const grant = grants.getStore();
  return grant !== undefined && grant.email === normaliseEmail(email);
}
