import { DomainError, type DomainErrorCode } from "@/server/domain/errors";

/**
 * The `domain:<code>` a database function raised, anywhere in the error's cause chain, as the matching refusal; `null` for anything else.
 * The driver error carries the statement and its parameters (an address, a live link), so a refusal replaces it and is never wrapped.
 */
export function databaseRefusal(error: unknown, allowed: ReadonlySet<DomainErrorCode>, message: string): DomainError | null {
  for (let current: unknown = error, depth = 0; current instanceof Error && depth < 10; current = current.cause, depth += 1) {
    const match = /^domain:([a-z-]+)$/.exec(current.message);
    const code = match?.[1] as DomainErrorCode | undefined;
    if (code !== undefined && allowed.has(code)) return new DomainError(code, message);
  }
  return null;
}
