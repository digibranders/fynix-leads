import type { DomainErrorCode } from "@/server/domain/errors";

/** What a refused action says, per reason, in plain words. A screen can override a reason when it can say something more exact. */
const MESSAGES: Readonly<Record<DomainErrorCode, string>> = {
  "invalid-input": "Check the details and try again.",
  "not-found": "That no longer exists. Refresh the page and try again.",
  "organisation-archived": "That organisation is archived, so nothing new can be added to it.",
  "email-in-use": "That email address already has an account.",
  "no-current-terms": "No terms are published for that kind of organisation yet, so an invite cannot go out.",
  "placeholder-terms": "The terms for that organisation are still placeholder text, so an invite cannot go out yet.",
  "alias-taken": "Another person already has that Fynix name. Choose a different one.",
  "invalid-transition": "That cannot be done in the current state. Refresh the page and try again.",
  "cannot-suspend-self": "You cannot suspend yourself.",
  "invite-not-live": "That invite is no longer live.",
  "ref-exhausted": "A reference could not be made. Try again.",
  "not-authorised": "You are not allowed to do that.",
  "invite-conflict": "Another invite for that address is being sent. Try again in a moment.",
  "admin-required": "Only a Fynix admin can change this. Ask an admin.",
  "not-a-supplier": "That agency is a partner agency, not a supplier.",
  "share-not-allowed": "A share goes to the campaign's supplier or one of its partner agencies.",
  "not-a-client-member": "A host must be an active person at the campaign's client.",
  "agreement-superseded": "That version has been replaced. Refresh the page.",
  "not-an-agreement-signer": "Only an active manager of that organisation can accept an agreement.",
  "already-accepted": "That person has accepted this version already.",
  "invalid-code": "The verification code is incorrect. Check the code sent to your mailbox.",
  "exclusion-conflict": "That exclusion rule already exists for this client.",
  "prospect-excluded": "This prospect matches an exclusion rule on the client's exclusion list.",
  "prospect-duplicate": "A lead for this prospect has already been submitted for this client.",
  "alias-not-verified": "The selected client-brand alias identity has not been verified yet.",
  "invalid-lead-stage": "This action cannot be performed on a lead in its current stage.",
  "dispute-window-expired": "The 48-hour dispute window for this delivered meeting has expired.",
};

export function domainMessage(code: DomainErrorCode, overrides: Partial<Record<DomainErrorCode, string>> = {}): string {
  return overrides[code] ?? MESSAGES[code];
}

/** Shown when a session ends or is not Fynix by the time a form is sent. */
export const SESSION_GONE = "Your session has ended. Sign in again to continue.";
/** Shown for a fault, which is anything that is not an expected refusal. */
export const SOMETHING_WENT_WRONG = "Something went wrong and nothing was saved. Try again.";
