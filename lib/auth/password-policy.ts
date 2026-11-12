/**
 * The length rule for a new password, in a module with no imports so a form can show the same rule the server enforces.
 * The server adds a breached-password check on top (server/auth/breach-check.ts); that part needs the network and
 * cannot run in a browser form.
 *
 * It applies only where a password is chosen: setting up an account, reset and change. Signing in accepts whatever the
 * account has, so a password set under an older rule keeps working.
 */
export const PASSWORD_MIN_LENGTH = 12;
/** Better Auth's own upper bound, and a limit on the work hashing a password costs. */
export const PASSWORD_MAX_LENGTH = 128;

/** The rule in one line, for the hint under a password field. */
export const PASSWORD_RULE = `Use at least ${PASSWORD_MIN_LENGTH} characters. Passwords that appear in known data breaches are refused.`;

/** The first thing wrong with the length of a new password, worded so the person can fix it, or `null` when it is fine. */
export function passwordLengthProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  return null;
}
