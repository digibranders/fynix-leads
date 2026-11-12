import { generatePublicRef, type RandomBytes, type RefPrefix } from "@/lib/domain/public-ref";
import type { ScopedTransaction } from "@/server/db/scope";
import { DomainError, isUniqueViolation } from "@/server/domain/errors";

const MAX_ATTEMPTS = 6;

/**
 * Runs `insert` with a fresh public reference and tries again with another one when the unique constraint says it is
 * taken. Four base-32 characters are about a million references, so a collision is rare and a retry is cheap. Each attempt
 * is a savepoint: a unique violation aborts a Postgres transaction, and without the savepoint the retry (and the audit
 * row that follows) would fail with "current transaction is aborted".
 */
export async function insertWithPublicRef<T>(
  tx: ScopedTransaction,
  spec: { readonly prefix: RefPrefix; readonly constraint: string; readonly randomBytes: RandomBytes },
  insert: (attempt: ScopedTransaction, ref: string) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const ref = generatePublicRef(spec.prefix, spec.randomBytes);
    try {
      return await tx.transaction((inner) => insert(inner, ref));
    } catch (error) {
      if (!isUniqueViolation(error, spec.constraint)) throw error;
    }
  }
  throw new DomainError("ref-exhausted", `No free ${spec.prefix} reference was found in ${MAX_ATTEMPTS} attempts.`);
}
