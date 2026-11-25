import { and, asc, eq, inArray, isNotNull, isNull, notExists } from "drizzle-orm";
import { agreement, agreementAcceptance, campaign, campaignHost, member, organisation } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";
import type { SetupFindings } from "@/lib/fynix/setup-checklist";

/** Clients and coordinators with no active manager, open campaigns with no active host, and campaign agreements a side has not accepted. Fynix read, open to staff. */
export async function readSetupFindings(deps: DomainDeps, actor: FynixActor): Promise<SetupFindings> {
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const noManager = (kind: "client" | "agency", partner = false) =>
      tx
        .select({ name: organisation.name, ref: organisation.publicRef })
        .from(organisation)
        .where(
          and(
            eq(organisation.kind, kind),
            eq(organisation.status, "active"),
            kind === "agency" ? (partner ? isNotNull(organisation.parentOrgId) : isNull(organisation.parentOrgId)) : undefined,
            notExists(tx.select({ one: member.id }).from(member).where(and(eq(member.orgId, organisation.id), eq(member.role, "manager"), eq(member.status, "active")))),
          ),
        )
        .orderBy(asc(organisation.name));
    const open = inArray(campaign.status, ["draft", "active", "paused"]);
    // One agreement per campaign: one finding for each side that has not accepted its current version.
    const notAccepted = (side: "client" | "supplier") =>
      tx
        .select({ campaignName: campaign.name, ref: campaign.publicRef })
        .from(agreement)
        .innerJoin(campaign, eq(campaign.id, agreement.campaignId))
        .where(
          and(
            open,
            eq(agreement.party, "client"),
            eq(agreement.status, "current"),
            notExists(tx.select({ one: agreementAcceptance.agreementId }).from(agreementAcceptance).where(and(eq(agreementAcceptance.agreementId, agreement.id), eq(agreementAcceptance.side, side)))),
          ),
        )
        .orderBy(asc(campaign.name));
    const [clientsWithoutManager, coordinatorsWithoutManager, agenciesWithoutManager, campaignsWithoutHost, clientWaiting, coordinatorWaiting] = await Promise.all([
      noManager("client"),
      noManager("agency"),
      noManager("agency", true),
      tx
        .select({ name: campaign.name, ref: campaign.publicRef })
        .from(campaign)
        .where(and(open, notExists(tx.select({ one: campaignHost.memberId }).from(campaignHost).where(and(eq(campaignHost.campaignId, campaign.id), eq(campaignHost.active, true))))))
        .orderBy(asc(campaign.name)),
      notAccepted("client"),
      notAccepted("supplier"),
    ]);
    const agreementsWaiting = [...clientWaiting.map((row) => ({ ...row, party: "client" as const })), ...coordinatorWaiting.map((row) => ({ ...row, party: "supplier" as const }))].sort((a, b) => a.campaignName.localeCompare(b.campaignName));
    return { clientsWithoutManager, coordinatorsWithoutManager, agenciesWithoutManager, campaignsWithoutHost, agreementsWaiting };
  });
}
