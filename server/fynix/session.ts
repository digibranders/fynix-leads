import "server-only";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { requireSessionContext } from "@/server/auth/guard";
import { SECOND_FACTOR_SETUP_PATH, secondFactorPending } from "@/server/auth/second-factor";
import { DomainError } from "@/server/domain/errors";
import type { FynixActor } from "@/server/domain/fynix-write";

/** Who is looking at a Fynix screen: the actor the domain reads take, the name on the account, and whether they may change set-up. */
export interface FynixView {
  readonly actor: FynixActor;
  readonly name: string;
  /** True for a Fynix admin. Staff read the screens and see no write control (the domain refuses their writes as well). */
  readonly canWrite: boolean;
  /** Whether this person has the second sign-in step on. The profile page shows its panel from this. */
  readonly twoFactorEnabled: boolean;
}

/**
 * For a Fynix page or layout, called inside a `<Suspense>` boundary: nobody signed in goes to the sign-in page, a signed-in
 * client or agency user gets the not-found page (the screens are not theirs, and their existence is not confirmed), and a
 * Fynix member gets the view (or, with `REQUIRE_FYNIX_2FA` on and no second step, the profile page). Every page calls it, not only the layout, because a layout does not run again on navigation.
 */
export async function requireFynix(options: { readonly allowWithoutSecondFactor?: boolean } = {}): Promise<FynixView> {
  // Request time from the first line, like the welcome page: the session read must never run while the shell is prerendered.
  await connection();
  const context = await requireSessionContext();
  if (context.kind !== "fynix") notFound();
  // REQUIRE_FYNIX_2FA (off by default): a Fynix person without the second step is sent to the profile page to turn it on. Only the layout and that page pass the option.
  if (options.allowWithoutSecondFactor !== true && secondFactorPending(context)) redirect(SECOND_FACTOR_SETUP_PATH);
  return { actor: { userId: context.userId }, name: context.name, canWrite: context.memberRole === "manager", twoFactorEnabled: context.twoFactorEnabled === true };
}

/** Awaits a domain read and turns "there is no such coordinator, campaign or reference" into the not-found page. Anything else is a fault and goes on. */
export async function orNotFound<T>(read: Promise<T>): Promise<T> {
  try {
    return await read;
  } catch (error) {
    if (error instanceof DomainError && (error.code === "not-found" || error.code === "invalid-input")) notFound();
    throw error;
  }
}
