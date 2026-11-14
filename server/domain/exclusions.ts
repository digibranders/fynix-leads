import { and, desc, eq } from "drizzle-orm";
import { matchesExclusion, normaliseDomain } from "@/lib/leads/normalize";
import type { Database } from "@/server/db/pool";
import { exclusionEntry } from "@/server/db/schema";
import { withTenantScope, type ScopedTransaction } from "@/server/db/scope";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError, isUniqueViolation } from "@/server/domain/errors";
import { addExclusionSchema, removeExclusionSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";

export interface ExclusionRecord {
  readonly id: string;
  readonly clientOrgId: string;
  readonly kind: "domain" | "email" | "company";
  readonly value: string;
  readonly reason: string | null;
  readonly createdAt: Date;
}

export const exclusionColumns = {
  id: exclusionEntry.id,
  clientOrgId: exclusionEntry.clientOrgId,
  kind: exclusionEntry.kind,
  value: exclusionEntry.value,
  reason: exclusionEntry.reason,
  createdAt: exclusionEntry.createdAt,
};

/**
 * Normalizes an exclusion value based on its kind.
 */
function cleanExclusionValue(kind: "domain" | "email" | "company", raw: string): string {
  if (kind === "email") return raw.trim().toLowerCase();
  if (kind === "domain") return normaliseDomain(raw);
  return raw.trim();
}

/**
 * Adds an exclusion rule for a client by a client manager.
 */
export async function addExclusionByClient(
  db: Database,
  _deps: Pick<DomainDeps, "now">,
  actor: { readonly userId: string; readonly orgId: string; readonly role: "member" | "manager" },
  input: unknown,
): Promise<ExclusionRecord> {
  if (actor.role !== "manager") {
    throw new DomainError("not-authorised", "Only a client manager can manage exclusion entries.");
  }
  const parsed = parseInput(addExclusionSchema, input);
  if (parsed.clientOrgId !== actor.orgId) {
    throw new DomainError("not-authorised", "Cannot add exclusions to another organisation.");
  }

  const value = cleanExclusionValue(parsed.kind, parsed.value);

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    try {
      const [created] = await tx
        .insert(exclusionEntry)
        .values({
          clientOrgId: actor.orgId,
          kind: parsed.kind,
          value,
          reason: parsed.reason ?? null,
        })
        .returning(exclusionColumns);

      if (created === undefined) throw new Error("Insert of exclusion_entry returned no row");

      return created as ExclusionRecord;
    } catch (error) {
      if (isUniqueViolation(error, "exclusion_entry_client_kind_value_unique")) {
        throw new DomainError("exclusion-conflict", "An exclusion for that rule already exists.");
      }
      throw error;
    }
  });
}

/**
 * Removes an exclusion rule by a client manager.
 */
export async function removeExclusionByClient(
  db: Database,
  actor: { readonly userId: string; readonly orgId: string; readonly role: "member" | "manager" },
  input: unknown,
): Promise<{ readonly removedId: string }> {
  if (actor.role !== "manager") {
    throw new DomainError("not-authorised", "Only a client manager can remove exclusion entries.");
  }
  const parsed = parseInput(removeExclusionSchema, input);

  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const [deleted] = await tx
      .delete(exclusionEntry)
      .where(and(eq(exclusionEntry.id, parsed.exclusionId), eq(exclusionEntry.clientOrgId, actor.orgId)))
      .returning({ id: exclusionEntry.id });

    if (deleted === undefined) {
      throw new DomainError("not-found", "There is no such exclusion entry.");
    }

    return { removedId: deleted.id };
  });
}

/**
 * Lists exclusion rules for a client organisation.
 */
export async function listClientExclusions(
  db: Database,
  actor: { readonly userId: string; readonly orgId: string },
): Promise<readonly ExclusionRecord[]> {
  return withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, async (tx) => {
    const rows = await tx
      .select(exclusionColumns)
      .from(exclusionEntry)
      .where(eq(exclusionEntry.clientOrgId, actor.orgId))
      .orderBy(desc(exclusionEntry.createdAt));

    return rows as ExclusionRecord[];
  });
}

/**
 * Checks if a candidate prospect matches any active exclusion entry for the specified client.
 */
export async function isProspectExcluded(
  tx: ScopedTransaction,
  clientOrgId: string,
  prospect: { readonly email: string; readonly domain: string; readonly company: string },
): Promise<boolean> {
  const rules = await tx
    .select(exclusionColumns)
    .from(exclusionEntry)
    .where(eq(exclusionEntry.clientOrgId, clientOrgId));

  return rules.some((rule) =>
    matchesExclusion(
      { kind: rule.kind as "domain" | "email" | "company", value: rule.value },
      prospect,
    ),
  );
}
