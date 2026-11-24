import { and, asc, eq, inArray, isNull, notExists } from "drizzle-orm";
import { agreement, agreementAcceptance, campaign, campaignHost, member, organisation } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";
import type { SetupFindings } from "@/lib/fynix/setup-checklist";

/** Clients and coordinators with no active manager, open campaigns with no active host, and current agreements nobody has accepted. Fynix read, open to staff. */
export async function readSetupFindings(deps: DomainDeps, actor: FynixActor): Promise<SetupFindings> {
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const noManager = (kind: "client" | "agency") =>
      tx
        .select({ name: organisation.name, ref: organisation.publicRef })
        .from(organisation)
        .where(
          and(
            eq(organisation.kind, kind),
            eq(organisation.status, "active"),
            kind === "agency" ? isNull(organisation.parentOrgId) : undefined,
            notExists(tx.select({ one: member.id }).from(member).where(and(eq(member.orgId, organisation.id), eq(member.role, "manager"), eq(member.status, "active")))),
          ),
        )
        .orderBy(asc(organisation.name));
    const open = inArray(campaign.status, ["draft", "active", "paused"]);
    const [clientsWithoutManager, coordinatorsWithoutManager, campaignsWithoutHost, waiting] = await Promise.all([
      noManager("client"),
      noManager("agency"),
      tx
        .select({ name: campaign.name, ref: campaign.publicRef })
        .from(campaign)
        .where(and(open, notExists(tx.select({ one: campaignHost.memberId }).from(campaignHost).where(and(eq(campaignHost.campaignId, campaign.id), eq(campaignHost.active, true))))))
        .orderBy(asc(campaign.name)),
      tx
        .select({ campaignName: campaign.name, ref: campaign.publicRef, party: agreement.party })
        .from(agreement)
        .innerJoin(campaign, eq(campaign.id, agreement.campaignId))
        .where(and(open, eq(agreement.status, "current"), notExists(tx.select({ one: agreementAcceptance.agreementId }).from(agreementAcceptance).where(eq(agreementAcceptance.agreementId, agreement.id)))))
        .orderBy(asc(campaign.name)),
    ]);
    return { clientsWithoutManager, coordinatorsWithoutManager, campaignsWithoutHost, agreementsWaiting: waiting };
  });
}
