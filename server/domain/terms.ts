import { and, desc, eq } from "drizzle-orm";
import type { OrganisationKind } from "@/lib/auth/session-lifetime";
import type { AuthDatabase } from "@/server/auth/auth-database";
import { termsAcceptance, termsDocument } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { publishTermsSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";

/** A published version of the terms for one party, as the accept-invite page shows it. */
export interface TermsRecord {
  readonly id: string;
  readonly party: OrganisationKind;
  readonly version: number;
  readonly title: string;
  readonly body: string;
  /** True while the text is not yet lawyer-approved (gate G2). */
  readonly placeholder: boolean;
  readonly publishedAt: Date;
}

const termsColumns = {
  id: termsDocument.id,
  party: termsDocument.party,
  version: termsDocument.version,
  title: termsDocument.title,
  body: termsDocument.body,
  placeholder: termsDocument.placeholder,
  publishedAt: termsDocument.publishedAt,
};

/** The current terms of a party, or `null` when none has been published. Read by `leads_auth` (invite redemption) and, in scripts, by the owner. */
export async function readCurrentTerms(db: Pick<AuthDatabase, "select">, party: OrganisationKind): Promise<TermsRecord | null> {
  const [row] = await db.select(termsColumns).from(termsDocument).where(and(eq(termsDocument.party, party), eq(termsDocument.status, "current"))).limit(1);
  return row ?? null;
}

/**
 * Publishes a new version of the terms for a party. The old current version becomes `superseded` in the same transaction and
 * the new one is `current` (the database allows exactly one current version per party), so every user of the party is asked
 * to accept the new text. A published text is never edited: the way to change it is to publish another version.
 */
export async function publishTerms(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<{ readonly id: string; readonly version: number }> {
  const parsed = parseInput(publishTermsSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    // The newest version is the one with the highest number, current or not; the lock stops two admins publishing the same number.
    const [latest] = await tx.select({ id: termsDocument.id, version: termsDocument.version, title: termsDocument.title, status: termsDocument.status }).from(termsDocument).where(eq(termsDocument.party, parsed.party)).orderBy(desc(termsDocument.version)).limit(1).for("update");
    if (latest?.status === "current") await tx.update(termsDocument).set({ status: "superseded" }).where(eq(termsDocument.id, latest.id));
    const version = (latest?.version ?? 0) + 1;
    const [created] = await tx.insert(termsDocument).values({ party: parsed.party, version, title: parsed.title, body: parsed.body }).returning({ id: termsDocument.id });
    if (created === undefined) throw new Error("The terms insert returned no row");
    await audit({
      action: "terms.publish",
      subject: { table: "terms_document", id: created.id, ref: `${parsed.party} v${version}` },
      before: latest === undefined ? null : { version: latest.version, title: latest.title, status: latest.status },
      after: { version, title: parsed.title, party: parsed.party, placeholder: false },
    });
    return { id: created.id, version };
  });
}

export interface NewAcceptance {
  readonly userId: string;
  readonly documentId: string;
  readonly party: OrganisationKind;
  /** The network address the person accepted from (`clientAddressFrom`), `unknown` when no proxy header was present. */
  readonly networkAddress: string;
}

/**
 * Records that a user accepted a version of the terms. Runs as `leads_auth`, on the transaction that creates the account for
 * invite redemption, and the database allows the row only for the current document of the party the user belongs to
 * (migration 0013). A second acceptance of the same version is refused by the unique constraint.
 */
export async function recordAcceptance(db: Pick<AuthDatabase, "insert">, acceptance: NewAcceptance): Promise<void> {
  await db.insert(termsAcceptance).values(acceptance);
}
