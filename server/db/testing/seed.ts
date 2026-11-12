import type { DatabaseHandle } from "@/server/db/pool";
import { account, campaign, member, organisation, session, user, verification } from "@/server/db/schema";

export interface SeededOrganisation {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly brandName: string | null;
  readonly kind: "fynix" | "client" | "agency";
}

export interface SeededCampaign {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly internalNotes: string;
  readonly client: SeededOrganisation;
  readonly agency: SeededOrganisation;
}

/** A person with a sign-in, and every secret that belongs to them, each distinct and findable as plain text. */
export interface SeededUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly organisation: SeededOrganisation;
  readonly passwordHash: string;
  readonly sessionToken: string;
  readonly resetToken: string;
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
  /** One user per organisation, each with a password hash, a live session token and a reset token. */
  readonly users: readonly SeededUser[];
}

function firstRow<T>(rows: readonly T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`Seeding ${what} returned no row`);
  return row;
}

/**
 * One user per organisation, written straight into the auth tables (no sign-in involved), with the rows a real sign-in
 * and a reset request would leave: a credential account, a live session and a reset token. The values are not valid
 * credentials; they exist so the leak matrix can search for them.
 */
async function seedUsers(owner: DatabaseHandle, organisations: readonly SeededOrganisation[]): Promise<SeededUser[]> {
  const { db } = owner;
  const users: SeededUser[] = [];
  for (const [index, organisation] of organisations.entries()) {
    const n = index + 1;
    const email = `person${n}@${organisation.publicRef.toLowerCase()}.example`;
    const name = `Person ${n} of ${organisation.publicRef}`;
    const row = firstRow(await db.insert(user).values({ email, name }).returning({ id: user.id }), `user ${email}`);
    const passwordHash = `HASH-${n}-not-a-real-scrypt-hash`;
    const sessionToken = `SESSION-TOKEN-${n}-not-a-real-token`;
    const resetToken = `RESET-TOKEN-${n}-not-a-real-token`;
    await db.insert(account).values({ accountId: row.id, providerId: "credential", userId: row.id, password: passwordHash });
    await db.insert(session).values({ token: sessionToken, userId: row.id, expiresAt: new Date(Date.now() + 3_600_000) });
    await db.insert(verification).values({ identifier: `reset-password:${resetToken}`, value: row.id, expiresAt: new Date(Date.now() + 3_600_000) });
    await db.insert(member).values({ userId: row.id, orgId: organisation.id, orgKind: organisation.kind, displayName: name });
    users.push({ id: row.id, email, name, organisation, passwordHash, sessionToken, resetToken });
  }
  return users;
}

/**
 * Writes through the owner connection, which bypasses row-level security. Test and dev databases only. Users are seeded
 * unless `withUsers` is false, which the auth tests use because they create real users through the account grant.
 */
export async function seedWorld(owner: DatabaseHandle, options: { readonly withUsers?: boolean } = {}): Promise<SeedWorld> {
  const { db } = owner;
  const insertOrganisation = async (publicRef: string, kind: "fynix" | "client" | "agency", name: string, brandName: string | null): Promise<SeededOrganisation> => {
    const row = firstRow(
      await db.insert(organisation).values({ publicRef, kind, name, brandName }).returning({ id: organisation.id }),
      `organisation ${publicRef}`,
    );
    return { id: row.id, publicRef, name, brandName, kind };
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

  const users = options.withUsers === false ? [] : await seedUsers(owner, [fynix, kestrel, halden, brightpath, northgate]);
  return { fynix, kestrel, halden, brightpath, northgate, campaigns, clients: [kestrel, halden], agencies: [brightpath, northgate], users };
}
