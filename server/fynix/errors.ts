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
  "not-a-coordinator": "That agency is a partner agency, not a coordinator.",
  "share-not-allowed": "A share goes to the campaign's coordinator or one of its partner agencies.",
  "not-a-client-member": "A host must be an active person at the campaign's client.",
  "agreement-superseded": "That version has been replaced. Refresh the page.",
  "not-an-agreement-signer": "Only an active manager of that organisation can accept an agreement.",
  "already-accepted": "That person has accepted this version already.",
  "invalid-code": "The verification code is incorrect. Check the code sent to your mailbox.",
  "exclusion-conflict": "That exclusion rule already exists for this client.",
  "prospect-excluded": "This prospect matches an exclusion rule on the client's exclusion list.",
  "prospect-duplicate": "A lead for this prospect has already been submitted for this client.",
  "alias-not-verified": "The selected client alias identity has not been verified yet.",
  "invalid-lead-stage": "This action cannot be performed on a lead in its current stage.",
  "duplicate-name": "A company with that name already exists. Check the list, or confirm to add it anyway.",
  "agreement-not-accepted": "The client and the coordinator must both accept the agreement before the campaign can go live.",
  "no-host": "The campaign needs at least one active host before it can go live.",
  "campaign-closed": "That campaign is closed. Reopen it first.",
  "agreement-unused": "Agreements are made for the campaign, not for the coordinator separately.",
  "outcome-already-recorded": "The outcome of this meeting was recorded already. Refresh the page.",
  "contest-window-closed": "The 48 hours to contest this outcome are over.",
  "review-window-closed": "The 48 hours to ask for a review of this rejection are over.",
  "already-requested": "A review of this rejection has been asked for already.",
  "privacy-link-missing": "Add the client's privacy page link first. Prospect email stays off until it is set.",
};

export function domainMessage(code: DomainErrorCode, overrides: Partial<Record<DomainErrorCode, string>> = {}): string {
  return overrides[code] ?? MESSAGES[code];
}

/** Shown when a session ends or is not Fynix by the time a form is sent. */
/** Shown when `REQUIRE_FYNIX_2FA` is on and the person has not yet turned the second sign-in step on. */
export const SECOND_FACTOR_REQUIRED = "Turn on the second sign-in step on your profile page first.";
export const SESSION_GONE = "Your session has ended. Sign in again to continue.";
/** Shown for a fault, which is anything that is not an expected refusal. */
export const SOMETHING_WENT_WRONG = "Something went wrong and nothing was saved. Try again.";
