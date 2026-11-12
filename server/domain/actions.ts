"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BREACH_CHECK_UNAVAILABLE, GENERIC_FAILURE, retryMessage } from "@/lib/auth/messages";
import type { InviteFormState } from "@/lib/domain/invite-form-state";
import { ACCOUNT_EXISTS, TERMS_CHANGED, TERMS_NOT_ACCEPTED, unavailableMessage } from "@/lib/domain/invite-messages";
import { getAuthServices } from "@/server/auth";
import { clientAddressFrom } from "@/server/auth/client-address";
import { signInWithPassword } from "@/server/auth/sign-in";
import { getDomain } from "@/server/domain";
import { redeemInvite } from "@/server/domain/redeem-invite";

/**
 * The server action behind the accept-invite form, a thin shell like the ones in server/auth/actions.ts: read the form, read
 * the network address from the proxy header, call `redeemInvite`, and turn its result into an `InviteFormState` or a redirect.
 * All the rules are in the service. Every export of a "use server" file is a public endpoint, so this file exports only actions.
 */

/** Where a person lands after the account is created and signed in. The same page every sign-in lands on. */
const DEFAULT_LANDING = "/welcome";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function redeemInviteAction(_previous: InviteFormState, formData: FormData): Promise<InviteFormState> {
  const requestHeaders = await headers();
  const address = clientAddressFrom(requestHeaders);
  const password = field(formData, "password");
  // The checkbox sends "on" when ticked and nothing when not. The hidden field carries the id of the terms that were on the page.
  const acceptedTermsId = field(formData, "accept") === "on" ? field(formData, "termsId") : null;

  let result;
  try {
    result = await redeemInvite(getDomain(), { token: field(formData, "token"), password, acceptedTermsId, address });
  } catch (error) {
    // A fault (the database is down, a bug, an alias clash found at the last step). Only the name is logged: the message can carry an address.
    console.error("The accept-invite action failed", error instanceof Error ? error.name : "unknown error");
    return { status: "error", message: GENERIC_FAILURE };
  }

  switch (result.status) {
    case "redeemed":
      break;
    case "rate-limited":
      return { status: "rate-limited", message: retryMessage(result.retryAfterSeconds) };
    case "weak-password":
      return { status: "error", message: result.message };
    case "check-unavailable":
      return { status: "error", message: BREACH_CHECK_UNAVAILABLE };
    case "terms-not-accepted":
      return { status: "error", message: TERMS_NOT_ACCEPTED };
    case "terms-changed":
      return { status: "terms-changed", message: TERMS_CHANGED };
    case "account-exists":
      return { status: "error", message: ACCOUNT_EXISTS };
    case "invite-unavailable":
      return { status: "unavailable", reason: result.reason, message: unavailableMessage(result.reason) };
  }

  // The account exists. Sign in with the password just chosen, through the normal sign-in (its own limits and cookie). If that
  // cannot be completed for any reason the account is still ready, so the person is sent to the sign-in page.
  let signedIn = false;
  try {
    signedIn = (await signInWithPassword(getAuthServices(), { email: result.email, password, address, headers: requestHeaders })).status === "signed-in";
  } catch (error) {
    console.error("Signing in after an invite failed", error instanceof Error ? error.name : "unknown error");
  }
  redirect(signedIn ? DEFAULT_LANDING : "/sign-in?invite=accepted");
}
