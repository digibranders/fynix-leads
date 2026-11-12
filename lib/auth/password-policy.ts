/**
 * The rule for a new password, in a module with no imports so a form can show the same rule the server enforces.
 * The server adds a breached-password check on top (server/auth/breach-check.ts); that part needs the network and
 * cannot run in a browser form.
 *
 * It applies only where a password is chosen: setting up an account, reset and change. Signing in accepts whatever the
 * account has, so a password set under an older rule keeps working.
 */
export const PASSWORD_MIN_LENGTH = 8;
/** Better Auth's own upper bound, and a limit on the work hashing a password costs. */
export const PASSWORD_MAX_LENGTH = 128;

/** The rule in one line, for the hint under a password field. */
export const PASSWORD_RULE = `Use at least ${PASSWORD_MIN_LENGTH} characters with a letter, a number and a special character. Passwords that appear in known data breaches are refused.`;

const MISSING_KIND = "Include at least one letter, one number and one special character.";

/** A special character is anything that is not a letter, a digit or white space, so a space alone does not count. */
const HAS_LETTER = /\p{L}/u;
const HAS_NUMBER = /\p{Nd}/u;
const HAS_SPECIAL = /[^\p{L}\p{N}\s]/u;

/** The first thing wrong with a new password, worded so the person can fix it, or `null` when it is fine. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  if (!HAS_LETTER.test(password) || !HAS_NUMBER.test(password) || !HAS_SPECIAL.test(password)) return MISSING_KIND;
  return null;
}
