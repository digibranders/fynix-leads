import { asc, desc, eq } from "drizzle-orm";
import { member, termsDocument, user } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";

export interface TeamMember {
  readonly name: string;
  readonly email: string;
  readonly role: "member" | "manager";
  readonly status: "active" | "suspended";
}

/** The terms people accept before they first use the portal, one line per party. */
export interface TermsSummary {
  readonly party: "client" | "agency";
  readonly version: number;
  readonly title: string;
  readonly placeholder: boolean;
  readonly publishedAt: Date;
}

export interface SettingsView {
  readonly team: readonly TeamMember[];
  readonly terms: readonly TermsSummary[];
}

/** The Fynix team and the current terms of each party. Fynix read, open to staff. */
export async function readSettings(deps: DomainDeps, actor: FynixActor): Promise<SettingsView> {
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const team = await tx
      .select({ name: member.displayName, email: user.email, role: member.role, status: member.status })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.orgKind, "fynix"))
      .orderBy(asc(member.displayName));
    const documents = await tx
      .select({ party: termsDocument.party, version: termsDocument.version, title: termsDocument.title, placeholder: termsDocument.placeholder, publishedAt: termsDocument.publishedAt })
      .from(termsDocument)
      .where(eq(termsDocument.status, "current"))
      .orderBy(desc(termsDocument.publishedAt));
    const terms = documents.flatMap((row): TermsSummary[] => (row.party === "client" || row.party === "agency" ? [{ ...row, party: row.party }] : []));
    return { team, terms };
  });
}
