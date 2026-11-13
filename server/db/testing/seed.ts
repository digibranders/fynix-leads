import { createHash } from "node:crypto";
import { PLACEHOLDER_TERMS } from "@/lib/terms/placeholder";
import type { DatabaseHandle } from "@/server/db/pool";
import {
  account,
  agencyAlias,
  agreement,
  agreementAcceptance,
  auditLog,
  campaign,
  campaignHost,
  campaignShare,
  emailOutbox,
  hostBlock,
  hostHours,
  invite,
  member,
  organisation,
  session,
  termsAcceptance,
  termsDocument,
  user,
  verification,
} from "@/server/db/schema";

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
  /** `manager` is a Fynix admin (or a client or agency manager); `member` is Fynix staff (or an ordinary client or agency user). */
  readonly role: "member" | "manager";
  readonly passwordHash: string;
  readonly sessionToken: string;
  readonly resetToken: string;
}

/** A pending invite, with the token that was never stored and the hash that was. */
export interface SeededInvite {
  readonly id: string;
  readonly organisation: SeededOrganisation;
  readonly email: string;
  readonly name: string;
  readonly token: string;
  readonly tokenHash: string;
}

/**
 * The phase 1C rows, seeded with users: the terms, one acceptance per user, an alias for each agency user, a pending invite
 * for a client and for an agency, two audit rows and a queued email that still holds its link. Every string below is
 * distinctive plain text, so the leak matrix can search for it, and no tenant may find any of them.
 */
export interface SeededDomain {
  readonly termsDocumentIds: Readonly<Record<"client" | "agency" | "fynix", string>>;
  readonly invites: readonly SeededInvite[];
  readonly aliases: readonly string[];
  readonly acceptanceAddresses: readonly string[];
  readonly auditMarkers: readonly string[];
  readonly outboxRecipient: string;
  readonly outboxLink: string;
}

/**
 * The phase 1D rows, seeded on request (`withSetup`): a partner agency under Brightpath, a client agreement and a supplier
 * agreement for the first campaign, one acceptance, a share for the partner, a host (the Kestrel user) with weekly hours in
 * another time zone and a blocked time. `markers` is every distinctive string stored in the new tables, so the leak matrix can
 * search for them; no tenant may find any of them until phase 1E grants the rows that are its own.
 */
export interface SeededSetup {
  readonly partner: SeededOrganisation;
  readonly markers: readonly string[];
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
  /**
   * One user per organisation, each with a password hash, a live session token and a reset token, in the order Fynix (the admin),
   * the two clients, the two agencies. A sixth user is a second Fynix member with the `member` role: Fynix staff, who may not change set-up.
   */
  readonly users: readonly SeededUser[];
  /** The phase 1C rows. Empty (`null`) when the world was seeded without users. */
  readonly domain: SeededDomain | null;
  /** The phase 1D rows. `null` unless the world was seeded with `withSetup: true`. */
  readonly setup: SeededSetup | null;
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
async function seedUsers(
  owner: DatabaseHandle,
  people: readonly { readonly organisation: SeededOrganisation; readonly role: "member" | "manager" }[],
): Promise<{ readonly users: SeededUser[]; readonly memberIds: Map<string, string> }> {
  const { db } = owner;
  const users: SeededUser[] = [];
  const memberIds = new Map<string, string>();
  for (const [index, person] of people.entries()) {
    const { organisation, role } = person;
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
    const memberRow = firstRow(await db.insert(member).values({ userId: row.id, orgId: organisation.id, orgKind: organisation.kind, role, displayName: name }).returning({ id: member.id }), `member ${email}`);
    memberIds.set(row.id, memberRow.id);
    users.push({ id: row.id, email, name, organisation, role, passwordHash, sessionToken, resetToken });
  }
  return { users, memberIds };
}

/** The base-32 SHA-256 the app stores for an invite token (server/domain/invite-token.ts), written out so the seed needs no app code. */
function hashSeedToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

async function seedDomain(owner: DatabaseHandle, world: Pick<SeedWorld, "fynix" | "kestrel" | "northgate">, seeded: { readonly users: readonly SeededUser[]; readonly memberIds: ReadonlyMap<string, string> }): Promise<SeededDomain> {
  const { db } = owner;
  const fynixUser = firstRow(seeded.users.filter((person) => person.organisation.kind === "fynix"), "the Fynix user");

  const documents = {} as Record<"client" | "agency" | "fynix", string>;
  for (const party of ["client", "agency", "fynix"] as const) {
    const text = PLACEHOLDER_TERMS[party];
    documents[party] = firstRow(await db.insert(termsDocument).values({ party, version: 1, title: text.title, body: text.body, placeholder: true }).returning({ id: termsDocument.id }), `terms ${party}`).id;
  }

  const acceptanceAddresses: string[] = [];
  const aliases: string[] = [];
  for (const [index, person] of seeded.users.entries()) {
    const address = `203.0.113.${index + 1}`;
    acceptanceAddresses.push(address);
    await db.insert(termsAcceptance).values({ userId: person.id, documentId: documents[person.organisation.kind], party: person.organisation.kind, networkAddress: address });
    if (person.organisation.kind === "agency") {
      const alias = `Seedalias ${index + 1}, Fynix`;
      aliases.push(alias);
      const memberId = seeded.memberIds.get(person.id);
      if (memberId === undefined) throw new Error(`No member was seeded for ${person.email}`);
      await db.insert(agencyAlias).values({ memberId, alias });
    }
  }

  const invites: SeededInvite[] = [];
  const pending = [
    { organisation: world.kestrel, email: "invitee.client@seed-invite.example", name: "Invitee Client Seed", alias: null },
    { organisation: world.northgate, email: "invitee.agency@seed-invite.example", name: "Invitee Agency Seed", alias: "Seedinvite alias, Fynix" },
  ] as const;
  for (const [index, row] of pending.entries()) {
    const token = `INVITE-TOKEN-${index + 1}-not-a-real-token-0123456789abcdef`;
    const tokenHash = hashSeedToken(token);
    const created = firstRow(
      await db
        .insert(invite)
        .values({ orgId: row.organisation.id, orgKind: row.organisation.kind, email: row.email, name: row.name, alias: row.alias, tokenHash, expiresAt: new Date(Date.now() + 7 * 86_400_000), createdBy: fynixUser.id })
        .returning({ id: invite.id }),
      `invite ${row.email}`,
    );
    invites.push({ id: created.id, organisation: row.organisation, email: row.email, name: row.name, token, tokenHash });
    if (row.alias !== null) aliases.push(row.alias);
  }

  const auditMarkers = ["AUDIT-BEFORE-MARKER-1 renamed from Kestrel Freight", "AUDIT-AFTER-MARKER-2 the secret internal note"];
  await db.insert(auditLog).values({ actorUserId: fynixUser.id, action: "campaign.update", subjectTable: "campaign", subjectId: fynixUser.id, subjectRef: "CMP-7Q2X", before: { note: auditMarkers[0] }, after: { note: auditMarkers[1] } });

  const outboxRecipient = "outbox.recipient@seed-outbox.example";
  const outboxLink = "https://seed.example/accept-invite?token=OUTBOX-LINK-not-a-real-token";
  await db.insert(emailOutbox).values({ recipient: outboxRecipient, template: "invite", subject: "Seeded invite", body: "Seeded body", params: {}, link: outboxLink });

  return { termsDocumentIds: documents, invites, aliases, acceptanceAddresses, auditMarkers, outboxRecipient, outboxLink };
}

const SETUP_MARKERS = {
  clientRules: "SETUP-RULES-CLIENT a no-show counts after ten minutes",
  clientNotes: "SETUP-NOTES-CLIENT review every quarter",
  supplierRules: "SETUP-RULES-SUPPLIER cancellations need two days notice",
  supplierNotes: "SETUP-NOTES-SUPPLIER paid on delivered meetings",
  acceptanceAddress: "198.51.100.77",
  hostTitle: "SETUP-HOST-TITLE Chief Operating Officer",
  hostZone: "Pacific/Auckland",
  blockNote: "SETUP-BLOCK-NOTE dentist appointment",
} as const;

async function seedSetup(
  owner: DatabaseHandle,
  world: { readonly kestrel: SeededOrganisation; readonly brightpath: SeededOrganisation; readonly campaigns: readonly SeededCampaign[] },
  seeded: { readonly users: readonly SeededUser[]; readonly memberIds: ReadonlyMap<string, string> },
): Promise<SeededSetup> {
  const { db } = owner;
  const memberOf = (person: SeededUser): string => {
    const id = seeded.memberIds.get(person.id);
    if (id === undefined) throw new Error(`No member was seeded for ${person.email}`);
    return id;
  };
  const admin = firstRow(seeded.users.filter((person) => person.organisation.kind === "fynix" && person.role === "manager"), "the Fynix admin");
  const kestrelUser = firstRow(seeded.users.filter((person) => person.organisation.id === world.kestrel.id), "the Kestrel user");
  const target = firstRow(world.campaigns, "campaign");

  const partnerRef = "ORG-6P3S";
  const partnerName = "Ridgeway Partner Media Ltd";
  const partnerRow = firstRow(await db.insert(organisation).values({ publicRef: partnerRef, kind: "agency", name: partnerName, parentOrgId: world.brightpath.id }).returning({ id: organisation.id }), "partner agency");
  const partner: SeededOrganisation = { id: partnerRow.id, publicRef: partnerRef, name: partnerName, brandName: null, kind: "agency" };

  const clientAgreement = firstRow(
    await db
      .insert(agreement)
      .values({ campaignId: target.id, party: "client", version: 1, monthlyTarget: 20, totalTarget: 120, rules: SETUP_MARKERS.clientRules, notes: SETUP_MARKERS.clientNotes, createdBy: memberOf(admin) })
      .returning({ id: agreement.id }),
    "client agreement",
  );
  await db.insert(agreement).values({ campaignId: target.id, party: "supplier", version: 1, monthlyTarget: 18, totalTarget: 108, rules: SETUP_MARKERS.supplierRules, notes: SETUP_MARKERS.supplierNotes, createdBy: memberOf(admin) });
  await db.insert(agreementAcceptance).values({ agreementId: clientAgreement.id, userId: kestrelUser.id, networkAddress: SETUP_MARKERS.acceptanceAddress });
  await db.insert(campaignShare).values({ campaignId: target.id, agencyOrgId: partner.id, monthlyShare: 7 });
  await db.insert(campaignHost).values({ campaignId: target.id, clientOrgId: world.kestrel.id, memberId: memberOf(kestrelUser), jobTitle: SETUP_MARKERS.hostTitle });
  await db.insert(hostHours).values({ memberId: memberOf(kestrelUser), timeZone: SETUP_MARKERS.hostZone, weekday: 1, startMinute: 540, endMinute: 1020 });
  await db.insert(hostBlock).values({ memberId: memberOf(kestrelUser), startsAt: new Date("2027-01-04T09:00:00Z"), endsAt: new Date("2027-01-04T11:00:00Z"), note: SETUP_MARKERS.blockNote });
  return { partner, markers: Object.values(SETUP_MARKERS) };
}

/**
 * Writes through the owner connection, which bypasses row-level security. Test and dev databases only. Users are seeded
 * unless `withUsers` is false, which the auth tests use because they create real users through the account grant. The
 * phase 1C rows (`domain`) are seeded with the users unless `withDomain` is false, which `pnpm db:seed` uses: a development
 * database has no use for a fake audit row or a queued email. The phase 1D rows (`setup`) are seeded only with `withSetup: true`,
 * which the leak matrix uses: a partner agency would change the organisation counts that older tests rely on.
 */
export async function seedWorld(owner: DatabaseHandle, options: { readonly withUsers?: boolean; readonly withDomain?: boolean; readonly withSetup?: boolean } = {}): Promise<SeedWorld> {
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

  const seeded =
    options.withUsers === false
      ? null
      : await seedUsers(owner, [
          { organisation: fynix, role: "manager" },
          { organisation: kestrel, role: "member" },
          { organisation: halden, role: "member" },
          { organisation: brightpath, role: "member" },
          { organisation: northgate, role: "member" },
          { organisation: fynix, role: "member" },
        ]);
  const domain = seeded === null || options.withDomain === false ? null : await seedDomain(owner, { fynix, kestrel, northgate }, seeded);
  if (options.withSetup === true && seeded === null) throw new Error("withSetup needs the users: the agreements, the acceptance and the host belong to people.");
  const setup = options.withSetup === true && seeded !== null ? await seedSetup(owner, { kestrel, brightpath, campaigns }, seeded) : null;
  return { fynix, kestrel, halden, brightpath, northgate, campaigns, clients: [kestrel, halden], agencies: [brightpath, northgate], users: seeded?.users ?? [], domain, setup };
}
