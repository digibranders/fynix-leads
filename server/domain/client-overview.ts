import { asc, count, eq } from "drizzle-orm";
import { campaign, member, organisation } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";

/** One row of the Fynix Clients screen. Fynix read, open to staff. */
export interface ClientRow {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  /** What an agency sees in place of the client's name. */
  readonly brandName: string;
  readonly status: "active" | "archived";
  readonly createdAt: Date;
  readonly peopleCount: number;
  readonly campaignCount: number;
}

/** Every client by name, archived ones included (their status says so). */
export async function listClientRows(deps: DomainDeps, actor: FynixActor): Promise<readonly ClientRow[]> {
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const clients = await tx
      .select({ id: organisation.id, publicRef: organisation.publicRef, name: organisation.name, brandName: organisation.brandName, status: organisation.status, createdAt: organisation.createdAt })
      .from(organisation)
      .where(eq(organisation.kind, "client"))
      .orderBy(asc(organisation.name));
    const people = new Map((await tx.select({ key: member.orgId, n: count() }).from(member).where(eq(member.orgKind, "client")).groupBy(member.orgId)).map((row) => [row.key, row.n]));
    const campaigns = new Map((await tx.select({ key: campaign.clientOrgId, n: count() }).from(campaign).groupBy(campaign.clientOrgId)).map((row) => [row.key, row.n]));
    return clients.map((row): ClientRow => ({ ...row, brandName: row.brandName ?? row.name, peopleCount: people.get(row.id) ?? 0, campaignCount: campaigns.get(row.id) ?? 0 }));
  });
}
