import { eq } from "drizzle-orm";
import { PLACEHOLDER_TERMS } from "@/lib/terms/placeholder";
import type { Database } from "@/server/db/pool";
import { termsDocument } from "@/server/db/schema";

const PARTIES = ["client", "agency", "fynix"] as const;

/**
 * Writes version 1 of the PLACEHOLDER terms for every party that has no terms at all, marked `placeholder = true` and
 * `current`. Run as the owner by `pnpm terms:placeholder` for a development database, and by the tests. It never touches a
 * party that already has a document, so it cannot replace real terms. Returns the parties it wrote. Not an admin action:
 * the owner is not Fynix, and nothing is audited. In production the first real terms are published through the terms
 * screen (phase 1D) after gate G2.
 */
export async function seedPlaceholderTerms(ownerDb: Database): Promise<readonly (typeof PARTIES)[number][]> {
  const written: (typeof PARTIES)[number][] = [];
  for (const party of PARTIES) {
    const existing = await ownerDb.select({ id: termsDocument.id }).from(termsDocument).where(eq(termsDocument.party, party)).limit(1);
    if (existing.length > 0) continue;
    const { title, body } = PLACEHOLDER_TERMS[party];
    await ownerDb.insert(termsDocument).values({ party, version: 1, title, body, placeholder: true });
    written.push(party);
  }
  return written;
}
