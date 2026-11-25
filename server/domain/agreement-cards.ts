import { isClosed } from "@/lib/campaign-status";
import { agreementCard, type AgreementCardModel } from "@/lib/agreements/card";
import type { Database } from "@/server/db/pool";
import { listAgreementVersions, listCurrentAgreements, type TenantAgreementVersion } from "@/server/domain/agreements-tenant";
import { listTenantCampaigns } from "@/server/domain/campaigns-tenant";
import type { TenantActor } from "@/server/domain/alias-identity";

export interface TenantAgreementCard extends AgreementCardModel<TenantAgreementVersion> {
  readonly campaignId: string;
  readonly campaignName: string;
  readonly clientName: string;
  /** A closed campaign's agreement is read only: nothing is accepted on it. */
  readonly closed: boolean;
}

/**
 * The agreement page of a client or a coordinator: one card per campaign that has an agreement, active ones first, with the version in force,
 * a newer version waiting for acceptance and the history. `orgKind` decides which side is "own".
 */
export async function loadAgreementCards(db: Database, actor: TenantActor & { readonly orgKind: "client" | "agency" }): Promise<readonly TenantAgreementCard[]> {
  const [current, campaigns] = await Promise.all([listCurrentAgreements(db, actor), listTenantCampaigns(db, actor, actor.orgKind === "client" ? "client" : "supplier")]);
  const status = new Map(campaigns.map((row) => [row.id, row.status]));
  const cards = await Promise.all(
    current.map(async (row): Promise<TenantAgreementCard> => ({
      ...agreementCard(await listAgreementVersions(db, actor, row.campaignId)),
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      clientName: row.clientName,
      closed: isClosed(status.get(row.campaignId) ?? "draft"),
    })),
  );
  return [...cards.filter((card) => !card.closed), ...cards.filter((card) => card.closed)];
}
