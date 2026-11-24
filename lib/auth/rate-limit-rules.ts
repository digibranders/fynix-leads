export interface RateLimitRule {
  /** The most hits one key may make in one window. */
  readonly limit: number;
  readonly windowSeconds: number;
}

/** One counter to consume: a key (hashed before it is stored) and the rule it is held to. */
export interface RateLimitCheck {
  readonly key: string;
  readonly rule: RateLimitRule;
}

const FIFTEEN_MINUTES = 15 * 60;
const ONE_HOUR = 60 * 60;

/**
 * Sign-in limits, in the order they are consumed. The first block stops the rest, so a blocked network cannot keep
 * adding rows by cycling email addresses.
 * 1. Per network: one address trying many accounts.
 * 2. Per account from that network: guessing one password.
 * 3. Per account from anywhere: a high ceiling, so a stranger cannot lock a real user out with a few requests.
 * `email` must already be normalised (see normaliseEmail). The keys carry no surface (client, agency or Fynix): the
 * same account is attacked through any of them, so they share one budget.
 */
export function signInChecks(email: string, address: string): readonly RateLimitCheck[] {
  return [
    { key: `sign-in:network:${address}`, rule: { limit: 20, windowSeconds: FIFTEEN_MINUTES } },
    { key: `sign-in:account-network:${email}:${address}`, rule: { limit: 8, windowSeconds: FIFTEEN_MINUTES } },
    { key: `sign-in:account:${email}`, rule: { limit: 50, windowSeconds: FIFTEEN_MINUTES } },
  ];
}

/**
 * Asking for a reset link sends an email, so these protect the inbox of the person asked about as much as the app:
 * a network cannot ask for many accounts, and one account cannot be asked about more than three times an hour.
 * The same keys are consumed whether or not the address has an account, so the limit reveals nothing.
 */
export function resetRequestChecks(email: string, address: string): readonly RateLimitCheck[] {
  return [
    { key: `reset-request:network:${address}`, rule: { limit: 10, windowSeconds: ONE_HOUR } },
    { key: `reset-request:account:${email}`, rule: { limit: 3, windowSeconds: ONE_HOUR } },
  ];
}

/** Submitting a reset token: bounds how many tokens one network can try. */
export function resetCompleteChecks(address: string): readonly RateLimitCheck[] {
  return [{ key: `reset-complete:network:${address}`, rule: { limit: 20, windowSeconds: ONE_HOUR } }];
}

/**
 * Looking an invite link up (the accept-invite page) is a way to guess tokens, so it is limited before the lookup, per
 * network. The token itself is 32 random bytes, so guessing is hopeless; the limit is for the load and for scanners.
 */
export function inviteLookupChecks(address: string): readonly RateLimitCheck[] {
  return [{ key: `invite-lookup:network:${address}`, rule: { limit: 30, windowSeconds: FIFTEEN_MINUTES } }];
}

/**
 * Redeeming an invite sets a password, so a network may try ten times an hour, and so may one invite: a person who gets
 * the password wrong or picks a breached one a few times is fine, a script is not. `tokenHash` is the stored hash, not the token.
 */
export function inviteRedeemChecks(tokenHash: string, address: string): readonly RateLimitCheck[] {
  return [
    { key: `invite-redeem:network:${address}`, rule: { limit: 10, windowSeconds: ONE_HOUR } },
    { key: `invite-redeem:token:${tokenHash}`, rule: { limit: 10, windowSeconds: ONE_HOUR } },
  ];
}

/**
 * Posting in a conversation, per signed-in user: a burst of chat is fine, a script is not. Each attached file also spends
 * from a slower budget, because a file costs a malware scan and disk. `fileCount` is how many files the message carries.
 */
export function messagePostChecks(userId: string, fileCount: number): readonly RateLimitCheck[] {
  const files: RateLimitCheck[] = Array.from({ length: fileCount }, () => ({ key: `message-file:user:${userId}`, rule: { limit: 30, windowSeconds: ONE_HOUR } }));
  return [{ key: `message-post:user:${userId}`, rule: { limit: 40, windowSeconds: 5 * 60 } }, ...files];
}

/** Submitting a lead, per signed-in user: an agency member works through a list, not hundreds an hour. */
export function leadSubmitChecks(userId: string): readonly RateLimitCheck[] {
  return [{ key: `lead-submit:user:${userId}`, rule: { limit: 60, windowSeconds: ONE_HOUR } }];
}

/** "Try again in 3 minutes", from the seconds left in the window. */
export function retryMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
