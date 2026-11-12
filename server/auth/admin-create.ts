import { eq } from "drizzle-orm";
import { z } from "zod";
import { normaliseEmail } from "@/lib/auth/email";
import { createAccountWithGrant } from "@/server/auth/create-account";
import type { Auth } from "@/server/auth/create-auth";
import type { Database } from "@/server/db/pool";
import { member, organisation, user } from "@/server/db/schema";

/** The one Fynix organisation has this reference, so `pnpm admin:create` finds it by kind and creates it with the same value everywhere. */
export const FYNIX_ORGANISATION_REF = "ORG-FYNX";
const FYNIX_ORGANISATION_NAME = "Fynix Digital";
const MAX_NAME_LENGTH = 120;

export interface AdminCreateServices {
  readonly auth: Auth;
  /** The `leads_auth` database, the one `auth` runs on. */
  readonly authDb: Database;
  /** The owner database. Bootstrap only, like `pnpm db:seed`: the first admin has to exist before anything can act as one. */
  readonly ownerDb: Database;
}

export interface CreatedAdmin {
  readonly userId: string;
  readonly email: string;
  readonly organisationRef: string;
}

const inputSchema = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1, "A name is required").max(MAX_NAME_LENGTH),
  password: z.string().min(1, "A password is required"),
});

/** Finds the Fynix organisation, or creates it. The partial unique index `organisation_one_fynix` makes a second one impossible. */
async function ensureFynixOrganisation(ownerDb: Database): Promise<{ readonly id: string }> {
  await ownerDb.insert(organisation).values({ publicRef: FYNIX_ORGANISATION_REF, kind: "fynix", name: FYNIX_ORGANISATION_NAME }).onConflictDoNothing();
  const rows = await ownerDb.select({ id: organisation.id }).from(organisation).where(eq(organisation.kind, "fynix")).limit(1);
  const row = rows[0];
  if (row === undefined) throw new Error("The Fynix organisation could not be created.");
  return row;
}

/**
 * Creates the first Fynix admin, or another one: an account, a membership in the Fynix organisation with the `manager`
 * role, and nothing else. Called by `pnpm admin:create` and by no route, so there is no public way to become an admin.
 *
 * Password only (decision D3). Gate G1 adds a second factor before any real client or agency data is entered; the place
 * for it is server/auth/second-factor.ts, and nothing here changes.
 *
 * The account is made first, through the same grant and the same password rules as any other, so a weak or breached
 * password creates nothing. If the membership cannot be written the account is removed again, because an account with
 * no membership could never sign in and would block the address.
 */
export async function createFynixAdmin(services: AdminCreateServices, input: { readonly email: string; readonly name: string; readonly password: string }): Promise<CreatedAdmin> {
  const parsed = inputSchema.parse({ ...input, email: normaliseEmail(input.email) });
  const fynix = await ensureFynixOrganisation(services.ownerDb);
  const account = await createAccountWithGrant(services.auth, services.authDb, { email: parsed.email, name: parsed.name, password: parsed.password });
  try {
    await services.ownerDb.insert(member).values({ userId: account.userId, orgId: fynix.id, orgKind: "fynix", role: "manager", displayName: parsed.name });
  } catch (error) {
    await services.ownerDb.delete(user).where(eq(user.id, account.userId));
    throw error;
  }
  return { userId: account.userId, email: account.email, organisationRef: FYNIX_ORGANISATION_REF };
}
