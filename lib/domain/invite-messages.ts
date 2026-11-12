/**
 * The words a person reads on the accept-invite page. Plain sentences in sentence case, no dashes, no exclamation marks. The
 * messages for a link that does not work never say whose invite it was.
 */
export type InviteUnavailableReason = "invalid" | "expired" | "revoked" | "redeemed";

export const INVITE_INVALID = "This link is not valid. Check that you copied all of it, or ask Fynix for a new invite.";
export const INVITE_EXPIRED = "This invite has expired. Ask Fynix to send you a new one.";
export const INVITE_REVOKED = "This invite was withdrawn. Ask Fynix to send you a new one.";
export const INVITE_USED = "This invite has been used already. Sign in instead.";

export function unavailableMessage(reason: InviteUnavailableReason): string {
  switch (reason) {
    case "invalid":
      return INVITE_INVALID;
    case "expired":
      return INVITE_EXPIRED;
    case "revoked":
      return INVITE_REVOKED;
    case "redeemed":
      return INVITE_USED;
  }
}

export const TERMS_NOT_ACCEPTED = "Tick the box to accept the terms and continue.";
export const TERMS_CHANGED = "The terms were updated while you were reading. Read the new version and accept it to continue.";
export const ACCOUNT_EXISTS = "This address already has an account. Ask your Fynix contact for help.";
/** Shown on the sign-in page after an invite was accepted but the automatic sign-in could not be completed. */
export const INVITE_ACCEPTED_NOTICE = "Your account is ready. Sign in with the password you chose.";
