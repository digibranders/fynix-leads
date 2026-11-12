/**
 * Why a domain action was refused. A `DomainError` is an expected outcome the screen words for the person (a duplicate, a
 * wrong state, an archived organisation), as opposed to a fault, which is any other error. The message is for a log or a
 * developer and never carries an email address, a name or a token.
 */
export type DomainErrorCode =
  | "invalid-input"
  | "not-found"
  | "organisation-archived"
  | "email-in-use"
  | "no-current-terms"
  | "placeholder-terms"
  | "alias-taken"
  | "invalid-transition"
  | "cannot-suspend-self"
  | "invite-not-live"
  | "ref-exhausted";

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** True for a unique-violation (23505) anywhere in the cause chain, optionally for one named constraint. Drizzle wraps the driver error. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  for (let current: unknown = error, depth = 0; current instanceof Error && depth < 10; current = current.cause, depth += 1) {
    const { code, constraint: name } = current as { code?: unknown; constraint?: unknown };
    if (code === "23505" && (constraint === undefined || name === constraint)) return true;
  }
  return false;
}
