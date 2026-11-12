import type { DatabaseHandle } from "@/server/db/pool";
import { campaign, organisation } from "@/server/db/schema";

export interface SeededOrganisation {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly brandName: string | null;
}

export interface SeededCampaign {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly internalNotes: string;
  readonly client: SeededOrganisation;
  readonly agency: SeededOrganisation;
}

/**
 * Two client organisations, two agencies and a campaign for every pairing, so each tenant has rows that are its own
 * and rows that belong to someone else. Every value is distinct and findable as plain text, which is what the leak
 * matrix searches responses for.
 */
export interface SeedWorld {
  readonly fynix: SeededOrganisation;
  readonly kestrel: SeededOrganisation;
  readonly halden: SeededOrganisation;
  readonly brightpath: SeededOrganisation;
  readonly northgate: SeededOrganisation;
  readonly campaigns: readonly SeededCampaign[];
  /** Same objects as `kestrel` and `halden`, in order. */
  readonly clients: readonly SeededOrganisation[];
  /** Same objects as `brightpath` and `northgate`, in order. */
  readonly agencies: readonly SeededOrganisation[];
}

function firstRow<T>(rows: readonly T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`Seeding ${what} returned no row`);
  return row;
}

/** Writes through the owner connection, which bypasses row-level security. Test and dev databases only. */
export async function seedWorld(owner: DatabaseHandle): Promise<SeedWorld> {
  const { db } = owner;
  const insertOrganisation = async (publicRef: string, kind: "fynix" | "client" | "agency", name: string, brandName: string | null): Promise<SeededOrganisation> => {
    const row = firstRow(
      await db.insert(organisation).values({ publicRef, kind, name, brandName }).returning({ id: organisation.id }),
      `organisation ${publicRef}`,
    );
    return { id: row.id, publicRef, name, brandName };
  };

  const fynix = await insertOrganisation("ORG-7F2A", "fynix", "Fynix Digital Operations", null);
  const kestrel = await insertOrganisation("ORG-4K9P", "client", "Kestrel Logistics Ltd", "Kestrel");
  const halden = await insertOrganisation("ORG-8H3D", "client", "Halden Foods Ltd", "Halden");
  const brightpath = await insertOrganisation("ORG-2B6R", "agency", "Brightpath Media Pvt Ltd", null);
  const northgate = await insertOrganisation("ORG-9N5T", "agency", "Northgate Leads Ltd", null);

  const insertCampaign = async (
    publicRef: string,
    name: string,
    internalNotes: string,
    client: SeededOrganisation,
    agency: SeededOrganisation,
  ): Promise<SeededCampaign> => {
    const row = firstRow(
      await db
        .insert(campaign)
        .values({
          publicRef,
          name,
          internalNotes,
          clientOrgId: client.id,
          agencyOrgId: agency.id,
          startDate: "2026-12-01",
          endDate: "2027-05-31",
          monthlyTarget: 20,
          totalTarget: 120,
        })
        .returning({ id: campaign.id }),
      `campaign ${publicRef}`,
    );
    return { id: row.id, publicRef, name, internalNotes, client, agency };
  };

  const campaigns = [
    await insertCampaign("CMP-7Q2X", "UK freight decision makers", "INTERNAL-NOTE margin on this one is thin", kestrel, brightpath),
    await insertCampaign("CMP-4M6R", "Retail grocery buyers", "INTERNAL-NOTE halden pays late", halden, brightpath),
    await insertCampaign("CMP-8T3W", "Nordic warehouse managers", "INTERNAL-NOTE northgate is on probation", kestrel, northgate),
    await insertCampaign("CMP-2V5Z", "Frozen food distributors", "INTERNAL-NOTE renewal in March", halden, northgate),
  ] as const;

  return { fynix, kestrel, halden, brightpath, northgate, campaigns, clients: [kestrel, halden], agencies: [brightpath, northgate] };
}
