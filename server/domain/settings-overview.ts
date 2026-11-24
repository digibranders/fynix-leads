import { desc, eq } from "drizzle-orm";
import { organisation, termsDocument } from "@/server/db/schema";
import { readPeople, type PersonRow } from "@/server/domain/people-overview";
import type { DomainDeps } from "@/server/domain/deps";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";

/** The terms people accept before they first use the portal, one line per party. */
export interface TermsSummary {
  readonly party: "client" | "agency" | "fynix";
  readonly version: number;
  readonly title: string;
  readonly placeholder: boolean;
  readonly publishedAt: Date;
}

export interface SettingsView {
  /** The Fynix organisation, which Fynix invites go to. */
  readonly fynixOrg: { readonly id: string; readonly name: string } | null;
  /** Everyone at Fynix, then the open invites. Every row says whether it is an admin (manager) or staff (member). */
  readonly team: readonly PersonRow[];
  readonly terms: readonly TermsSummary[];
}

/** The Fynix team and the current terms of each party. Fynix read, open to staff. */
export async function readSettings(deps: DomainDeps, actor: FynixActor): Promise<SettingsView> {
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const [fynixOrg = null] = await tx.select({ id: organisation.id, name: organisation.name }).from(organisation).where(eq(organisation.kind, "fynix")).limit(1);
    const team = fynixOrg === null ? [] : await readPeople(tx, [fynixOrg], deps.now());
    const documents = await tx
      .select({ party: termsDocument.party, version: termsDocument.version, title: termsDocument.title, placeholder: termsDocument.placeholder, publishedAt: termsDocument.publishedAt })
      .from(termsDocument)
      .where(eq(termsDocument.status, "current"))
      .orderBy(desc(termsDocument.publishedAt));
    const terms = documents.flatMap((row): TermsSummary[] => (row.party === "client" || row.party === "agency" || row.party === "fynix" ? [{ ...row, party: row.party }] : []));
    return { fynixOrg, team, terms };
  });
}
