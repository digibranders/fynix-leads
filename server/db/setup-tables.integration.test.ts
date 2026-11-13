import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agreement, agreementAcceptance, campaignHost, campaignShare, member, organisation } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { captureErrorText, openTestDatabases, resetDatabase, type TestDatabases } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";

/**
 * The phase 1D tables as the database enforces them: who may touch each, which columns Fynix may change, the checks, the
 * unique constraints and the triggers. Everything is written as the owner unless a test is about the Fynix role. The services
 * are tested in server/domain/*.integration.test.ts.
 */

let dbs: TestDatabases;
let world: SeedWorld;

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetDatabase(dbs.owner);
  world = await seedWorld(dbs.owner);
});

const failure = (work: PromiseLike<unknown>): Promise<string> => captureErrorText(Promise.resolve(work));
const PRIVILEGES = ["DELETE", "INSERT", "SELECT", "TRUNCATE", "UPDATE"] as const;

/** The table level privileges a role holds on a table, in alphabetical order. Column grants do not count here. */
async function tablePrivileges(role: string, table: string): Promise<string[]> {
  const held: string[] = [];
  for (const privilege of PRIVILEGES) {
    const result = await dbs.owner.db.execute<{ allowed: boolean }>(sql.raw(`select has_table_privilege('${role}', 'public.${table}', '${privilege}') as allowed`));
    if (result.rows[0]?.allowed === true) held.push(privilege);
  }
  return held;
}

/** The columns of a table that a role may UPDATE, in table order. A table level UPDATE lists every column. */
async function updatableColumns(role: string, table: string): Promise<string[]> {
  const result = await dbs.owner.db.execute<{ name: string }>(
    sql.raw(`select a.attname::text as name from pg_attribute a
      where a.attrelid = 'public.${table}'::regclass and a.attnum > 0 and not a.attisdropped and has_column_privilege('${role}', a.attrelid, a.attnum, 'UPDATE')
      order by a.attnum`),
  );
  return result.rows.map((row) => row.name);
}

function firstOf<T>(rows: readonly T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`No ${what} in the seed world`);
  return row;
}

const campaignId = (): string => firstOf(world.campaigns, "campaign").id;
const userId = (index: number): string => firstOf(world.users.slice(index), "user").id;
async function memberIdOf(user: string): Promise<string> {
  return firstOf(await dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.userId, user)), "member").id;
}

async function newAgreement(overrides: Partial<typeof agreement.$inferInsert> = {}): Promise<string> {
  const rows = await dbs.owner.db
    .insert(agreement)
    .values({ campaignId: campaignId(), party: "client", version: 1, monthlyTarget: 20, totalTarget: 120, createdBy: await memberIdOf(userId(0)), ...overrides })
    .returning({ id: agreement.id });
  return firstOf(rows, "agreement").id;
}

describe("agreement", () => {
  it("is Fynix only: Fynix reads and inserts, and may change the status and nothing else; no other role holds anything", async () => {
    expect(await tablePrivileges("leads_fynix", "agreement")).toEqual(["INSERT", "SELECT"]);
    expect(await updatableColumns("leads_fynix", "agreement")).toEqual(["status"]);
    for (const role of ["leads_client", "leads_agency", "leads_auth", "leads_public"]) {
      expect(await tablePrivileges(role, "agreement"), role).toEqual([]);
      expect(await updatableColumns(role, "agreement"), role).toEqual([]);
    }
  });

  it("holds one row per campaign, party and version, and one current version per campaign and party", async () => {
    await newAgreement();
    expect(await failure(newAgreement())).toContain("agreement_campaign_party_version_unique");
    expect(await failure(newAgreement({ version: 2 }))).toContain("agreement_one_current");
    await newAgreement({ party: "supplier" });
    await newAgreement({ version: 2, status: "superseded" });
  });

  it("refuses to bring a superseded version back, even when no other version is current", async () => {
    const id = await newAgreement({ status: "superseded" });
    expect(await failure(dbs.owner.db.update(agreement).set({ status: "current" }).where(eq(agreement.id, id)))).toContain("agreement_superseded_is_final");
  });

  it("lets a current version be superseded", async () => {
    const id = await newAgreement();
    await dbs.owner.db.update(agreement).set({ status: "superseded" }).where(eq(agreement.id, id));
    expect(firstOf(await dbs.owner.db.select({ status: agreement.status }).from(agreement).where(eq(agreement.id, id)), "agreement").status).toBe("superseded");
  });

  it.each([
    ["a version below 1", { version: 0 }, "agreement_version_positive"],
    ["a negative monthly target", { monthlyTarget: -1 }, "agreement_targets_not_negative"],
    ["a negative total target", { totalTarget: -1 }, "agreement_targets_not_negative"],
    ["a dispute window of 0 hours", { disputeWindowHours: 0 }, "agreement_dispute_window_range"],
    ["a dispute window over 720 hours", { disputeWindowHours: 721 }, "agreement_dispute_window_range"],
  ])("refuses %s", async (_label, overrides, constraint) => {
    expect(await failure(newAgreement(overrides))).toContain(constraint);
  });

  it("defaults the dispute window to 48 hours and the rules and notes to empty text", async () => {
    const id = await newAgreement();
    const row = firstOf(await dbs.owner.db.select({ window: agreement.disputeWindowHours, rules: agreement.rules, notes: agreement.notes }).from(agreement).where(eq(agreement.id, id)), "agreement");
    expect(row).toEqual({ window: 48, rules: "", notes: "" });
  });

  it("must name an existing campaign and an existing member as its author", async () => {
    expect(await failure(newAgreement({ campaignId: "99999999-9999-4999-8999-999999999999" }))).toContain("foreign key");
    expect(await failure(newAgreement({ createdBy: "99999999-9999-4999-8999-999999999999" }))).toContain("foreign key");
  });

  it("cannot be changed by Fynix without an audit row", async () => {
    const author = await memberIdOf(userId(0));
    const message = await failure(
      withScope(dbs.roles.leads_fynix.db, { orgId: null, userId: userId(0) }, (tx) =>
        tx.insert(agreement).values({ campaignId: campaignId(), party: "client", version: 1, monthlyTarget: 1, totalTarget: 1, createdBy: author }),
      ),
    );
    expect(message).toContain("A change to agreement by Fynix has no audit_log row in its transaction");
  });
});

describe("agreement_acceptance", () => {
  it("lets Fynix read and add, and nothing else: an acceptance is never changed or removed; no other role holds anything", async () => {
    expect(await tablePrivileges("leads_fynix", "agreement_acceptance")).toEqual(["INSERT", "SELECT"]);
    expect(await updatableColumns("leads_fynix", "agreement_acceptance")).toEqual([]);
    for (const role of ["leads_client", "leads_agency", "leads_auth", "leads_public"]) {
      expect(await tablePrivileges(role, "agreement_acceptance"), role).toEqual([]);
      expect(await updatableColumns(role, "agreement_acceptance"), role).toEqual([]);
    }
  });

  it("holds one acceptance per agreement and user, and each must name a real agreement and user", async () => {
    const id = await newAgreement();
    const row = { agreementId: id, userId: userId(1), networkAddress: "203.0.113.9" };
    await dbs.owner.db.insert(agreementAcceptance).values(row);
    expect(await failure(dbs.owner.db.insert(agreementAcceptance).values(row))).toContain("agreement_acceptance_agreement_user_unique");
    expect(await failure(dbs.owner.db.insert(agreementAcceptance).values({ ...row, agreementId: "99999999-9999-4999-8999-999999999999" }))).toContain("foreign key");
    expect(await failure(dbs.owner.db.insert(agreementAcceptance).values({ ...row, userId: "99999999-9999-4999-8999-999999999999" }))).toContain("foreign key");
  });
});



async function newAgency(publicRef: string, parentOrgId: string | null): Promise<string> {
  const rows = await dbs.owner.db.insert(organisation).values({ publicRef, kind: "agency", name: `Agency ${publicRef}`, parentOrgId }).returning({ id: organisation.id });
  return firstOf(rows, "organisation").id;
}

async function newShare(agencyOrgId: string, monthlyShare = 5): Promise<string> {
  const rows = await dbs.owner.db.insert(campaignShare).values({ campaignId: campaignId(), agencyOrgId, monthlyShare }).returning({ id: campaignShare.id });
  return firstOf(rows, "share").id;
}

describe("campaign_share", () => {
  it("is Fynix only: Fynix reads, adds and removes shares and may change the amount; no other role holds anything", async () => {
    expect(await tablePrivileges("leads_fynix", "campaign_share")).toEqual(["DELETE", "INSERT", "SELECT"]);
    expect(await updatableColumns("leads_fynix", "campaign_share")).toEqual(["monthly_share", "updated_at"]);
    for (const role of ["leads_client", "leads_agency", "leads_auth", "leads_public"]) {
      expect(await tablePrivileges(role, "campaign_share"), role).toEqual([]);
      expect(await updatableColumns(role, "campaign_share"), role).toEqual([]);
    }
  });

  it("accepts the campaign's supplier and a partner agency of that supplier", async () => {
    await newShare(world.brightpath.id);
    await newShare(await newAgency("ORG-3C4D", world.brightpath.id), 7);
  });

  it("refuses another supplier, a partner agency of another supplier and a client", async () => {
    expect(await failure(newShare(world.northgate.id))).toContain("campaign_share_agency_not_in_supplier_tree");
    const strangers = await newAgency("ORG-5E6F", world.northgate.id);
    expect(await failure(newShare(strangers))).toContain("campaign_share_agency_not_in_supplier_tree");
    expect(await failure(newShare(world.kestrel.id))).toMatch(/campaign_share_agency/);
  });

  it("holds one share per campaign and agency, and refuses a negative share", async () => {
    await newShare(world.brightpath.id);
    expect(await failure(newShare(world.brightpath.id))).toContain("campaign_share_campaign_agency_unique");
    const partner = await newAgency("ORG-3C4D", world.brightpath.id);
    expect(await failure(newShare(partner, -1))).toContain("campaign_share_not_negative");
  });

  it("refuses to change the parent of an organisation that holds a share: it would stop being the supplier's partner", async () => {
    const partner = await newAgency("ORG-3C4D", world.brightpath.id);
    await newShare(partner);
    expect(await failure(dbs.owner.db.update(organisation).set({ parentOrgId: world.northgate.id }).where(eq(organisation.id, partner)))).toContain("organisation_has_shares");
    expect(await failure(dbs.owner.db.update(organisation).set({ parentOrgId: null }).where(eq(organisation.id, partner)))).toContain("organisation_has_shares");
  });

  it("refuses to point an existing share at an organisation outside the supplier's tree", async () => {
    const id = await newShare(world.brightpath.id);
    expect(await failure(dbs.owner.db.update(campaignShare).set({ agencyOrgId: world.northgate.id }).where(eq(campaignShare.id, id)))).toContain("campaign_share_agency_not_in_supplier_tree");
  });
});

/** The kestrel user's membership: Kestrel is the client of the first campaign. */
const kestrelMember = (): Promise<string> => memberIdOf(userId(1));

async function newHost(overrides: Partial<typeof campaignHost.$inferInsert> = {}): Promise<string> {
  const rows = await dbs.owner.db
    .insert(campaignHost)
    .values({ campaignId: campaignId(), clientOrgId: world.kestrel.id, memberId: await kestrelMember(), jobTitle: "Chief Operating Officer", ...overrides })
    .returning({ id: campaignHost.id });
  return firstOf(rows, "host").id;
}

describe("campaign_host", () => {
  it("is Fynix only: Fynix reads and adds hosts and may change the title and the active flag, never remove one; no other role holds anything", async () => {
    expect(await tablePrivileges("leads_fynix", "campaign_host")).toEqual(["INSERT", "SELECT"]);
    expect(await updatableColumns("leads_fynix", "campaign_host")).toEqual(["job_title", "active"]);
    for (const role of ["leads_client", "leads_agency", "leads_auth", "leads_public"]) {
      expect(await tablePrivileges(role, "campaign_host"), role).toEqual([]);
      expect(await updatableColumns(role, "campaign_host"), role).toEqual([]);
    }
  });

  it("accepts a member of the campaign's client, active by default", async () => {
    const id = await newHost();
    expect(firstOf(await dbs.owner.db.select({ active: campaignHost.active }).from(campaignHost).where(eq(campaignHost.id, id)), "host").active).toBe(true);
  });

  it("refuses a member of another client and a member of an agency", async () => {
    expect(await failure(newHost({ memberId: await memberIdOf(userId(2)) }))).toContain("campaign_host_member_fk");
    expect(await failure(newHost({ memberId: await memberIdOf(userId(3)) }))).toContain("campaign_host_member_fk");
  });

  it("refuses a client organisation that is not the campaign's, even for that organisation's own member", async () => {
    expect(await failure(newHost({ clientOrgId: world.halden.id, memberId: await memberIdOf(userId(2)) }))).toContain("campaign_host_campaign_fk");
  });

  it("holds one row per campaign and member, and a job title of 1 to 120 characters", async () => {
    await newHost();
    expect(await failure(newHost())).toContain("campaign_host_campaign_member_unique");
    const kestrelsSecond = firstOf(world.campaigns.slice(2), "campaign").id;
    expect(await failure(newHost({ campaignId: kestrelsSecond, jobTitle: "" }))).toContain("campaign_host_job_title_length");
    expect(await failure(newHost({ campaignId: kestrelsSecond, jobTitle: "x".repeat(121) }))).toContain("campaign_host_job_title_length");
  });
});
