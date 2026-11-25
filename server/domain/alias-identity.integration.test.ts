import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { aliasIdentity, emailOutbox } from "@/server/db/schema";
import {
  createAliasIdentity,
  listAliasClients,
  listAliasIdentities,
  retireAliasIdentity,
  updateAliasIdentity,
  verifyAliasCode,
  type TenantActor,
} from "@/server/domain/alias-identity";
import { organisation } from "@/server/db/schema";
import { refusal } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});
beforeEach(async () => {
  await rig.reset();
});

const getAgencyActor = (role: "member" | "manager" = "member"): TenantActor => {
  const world = rig.world();
  const user = world.users.find((u) => u.organisation.id === world.brightpath.id);
  if (user === undefined) throw new Error("No agency user in seed world");
  return {
    userId: user.id,
    orgId: world.brightpath.id,
    orgKind: "agency",
    role,
  };
};

const getClientActor = (): TenantActor => {
  const world = rig.world();
  const user = world.users.find((u) => u.organisation.id === world.kestrel.id);
  if (user === undefined) throw new Error("No client user in seed world");
  return {
    userId: user.id,
    orgId: world.kestrel.id,
    orgKind: "client",
    role: "manager",
  };
};

/** The code the alias mailbox was sent: the only place it exists in the clear, since the application never returns it. */
async function mailedCode(aliasEmail: string): Promise<string> {
  const [row] = await rig.dbs.owner.db.select({ params: emailOutbox.params }).from(emailOutbox).where(eq(emailOutbox.recipient, aliasEmail));
  const code = (row?.params as { code?: unknown } | undefined)?.code;
  if (typeof code !== "string") throw new Error("No verification code was queued for that alias");
  return code;
}

describe("createAliasIdentity", () => {
  it("creates an alias identity with a generated publicRef and 6-digit code", async () => {
    const actor = getAgencyActor();
    const created = await createAliasIdentity(rig.dbs.roles.leads_agency.db, rig.deps(), actor, {
      clientOrgId: rig.world().kestrel.id,
      displayName: "Alex Croft",
      jobTitle: "Security SDR",
      aliasEmail: "alex@kestrel-outreach.example",
    });

    expect(created.publicRef).toMatch(/^ALI-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(created.clientOrgId).toBe(rig.world().kestrel.id);
    expect(created.clientName).toBe(rig.world().kestrel.name);
    expect(created.displayName).toBe("Alex Croft");
    expect(created.jobTitle).toBe("Security SDR");
    expect(created.aliasEmail).toBe("alex@kestrel-outreach.example");
    expect(created.verifiedAt).toBeNull();
    expect(created.status).toBe("active");
    expect(await mailedCode(created.aliasEmail)).toMatch(/^\d{6}$/);

    const [row] = await rig.dbs.owner.db
      .select()
      .from(aliasIdentity)
      .where(eq(aliasIdentity.publicRef, created.publicRef));
    expect(row?.verificationCodeHash).not.toBeNull();
  });

  it("refuses duplicate alias for the same member, client and email", async () => {
    const actor = getAgencyActor();
    const input = {
      clientOrgId: rig.world().kestrel.id,
      displayName: "Alex Croft",
      jobTitle: "Security SDR",
      aliasEmail: "alex@kestrel-outreach.example",
    };
    await createAliasIdentity(rig.dbs.roles.leads_agency.db, rig.deps(), actor, input);

    const err = await refusal(createAliasIdentity(rig.dbs.roles.leads_agency.db, rig.deps(), actor, input));
    expect(err.code).toBe("alias-taken");
  });

  it("refuses client actors", async () => {
    const clientActor = getClientActor();
    const err = await refusal(
      createAliasIdentity(rig.dbs.roles.leads_client.db, rig.deps(), clientActor, {
        clientOrgId: rig.world().kestrel.id,
        displayName: "Alex Croft",
        jobTitle: "Security SDR",
        aliasEmail: "alex@kestrel-outreach.example",
      }),
    );
    expect(err.code).toBe("not-authorised");
  });
});

describe("verifyAliasCode", () => {
  it("verifies with the correct 6-digit code and clears the code hash", async () => {
    const actor = getAgencyActor();
    const created = await createAliasIdentity(rig.dbs.roles.leads_agency.db, rig.deps(), actor, {
      clientOrgId: rig.world().kestrel.id,
      displayName: "Alex Croft",
      jobTitle: "Security SDR",
      aliasEmail: "alex@kestrel-outreach.example",
    });

    const verified = await verifyAliasCode(rig.dbs.roles.leads_agency.db, rig.deps(), actor, {
      publicRef: created.publicRef,
      code: await mailedCode(created.aliasEmail),
    });

    expect(verified.verifiedAt).not.toBeNull();

    const [row] = await rig.dbs.owner.db
      .select()
      .from(aliasIdentity)
      .where(eq(aliasIdentity.publicRef, created.publicRef));
    expect(row?.verificationCodeHash).toBeNull();
    expect(row?.verifiedAt).not.toBeNull();
  });

  it("refuses verification with an incorrect code", async () => {
    const actor = getAgencyActor();
    const created = await createAliasIdentity(rig.dbs.roles.leads_agency.db, rig.deps(), actor, {
      clientOrgId: rig.world().kestrel.id,
      displayName: "Alex Croft",
      jobTitle: "Security SDR",
      aliasEmail: "alex@kestrel-outreach.example",
    });

    const wrongCode = (await mailedCode(created.aliasEmail)) === "123456" ? "654321" : "123456";
    const err = await refusal(
      verifyAliasCode(rig.dbs.roles.leads_agency.db, rig.deps(), actor, {
        publicRef: created.publicRef,
        code: wrongCode,
      }),
    );
    expect(err.code).toBe("invalid-code");
  });
});

describe("listAliasIdentities", () => {
  it("lists all alias identities of the agency", async () => {
    const actor = getAgencyActor();
    await createAliasIdentity(rig.dbs.roles.leads_agency.db, rig.deps(), actor, {
      clientOrgId: rig.world().kestrel.id,
      displayName: "Alex Croft",
      jobTitle: "Security SDR",
      aliasEmail: "alex@kestrel-outreach.example",
    });

    const list = await listAliasIdentities(rig.dbs.roles.leads_agency.db, actor);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0]?.clientName).toBe(rig.world().kestrel.name);
  });
});

describe("the client of an alias (phase 2)", () => {
  const input = (clientOrgId: string) => ({ clientOrgId, displayName: "Alex Croft", jobTitle: "Security SDR", aliasEmail: "alex@kestrel-outreach.example" });
  const agency = () => rig.dbs.roles.leads_agency.db;

  it("lists the clients of the campaigns the agency sees, by name, and nobody else's", async () => {
    const world = rig.world();
    await rig.dbs.owner.db.insert(organisation).values({ publicRef: "ORG-ZZ9Z", kind: "client", name: "Unrelated Ltd" });
    const clients = await listAliasClients(agency(), getAgencyActor());
    expect(clients.map((row) => row.id).sort()).toEqual([world.kestrel.id, world.halden.id].sort());
    expect(clients.map((row) => row.name).sort()).toEqual([world.kestrel.name, world.halden.name].sort());
    expect((await refusal(listAliasClients(rig.dbs.roles.leads_client.db, getClientActor()))).code).toBe("not-authorised");
  });

  it("refuses a client the agency has no campaign for, in the domain and in the database", async () => {
    const [stranger] = await rig.dbs.owner.db.insert(organisation).values({ publicRef: "ORG-ZZ9Z", kind: "client", name: "Unrelated Ltd" }).returning({ id: organisation.id });
    expect((await refusal(createAliasIdentity(agency(), rig.deps(), getAgencyActor(), input(stranger?.id ?? "")))).code).toBe("invalid-input");
    // The trigger holds even when the domain is bypassed.
    const member = rig.world().users.find((u) => u.organisation.id === rig.world().brightpath.id);
    expect(member).toBeDefined();
    const { sql } = await import("drizzle-orm");
    await expect(
      agency().transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.org_id', ${rig.world().brightpath.id}, true), set_config('app.user_id', ${getAgencyActor().userId}, true)`);
        await tx.execute(
          sql`insert into alias_identity (public_ref, member_id, client_org_id, display_name, job_title, alias_email) select 'ALI-ZZ9Z', m.id, ${stranger?.id ?? ""}::uuid, 'x', 'x', 'x@example.com' from member m where m.user_id = ${getAgencyActor().userId}`,
        );
      }),
    ).rejects.toThrow();
  });

  it("edits the client, name and title, shows the new client's name, and refuses another client and a retired alias", async () => {
    const world = rig.world();
    const created = await createAliasIdentity(agency(), rig.deps(), getAgencyActor(), input(world.kestrel.id));
    const edited = await updateAliasIdentity(agency(), getAgencyActor(), { publicRef: created.publicRef, clientOrgId: world.halden.id, displayName: "Alexa Croft", jobTitle: "Lead SDR" });
    expect(edited).toMatchObject({ clientOrgId: world.halden.id, clientName: world.halden.name, displayName: "Alexa Croft", jobTitle: "Lead SDR", aliasEmail: created.aliasEmail });
    const [stranger] = await rig.dbs.owner.db.insert(organisation).values({ publicRef: "ORG-ZZ9Z", kind: "client", name: "Unrelated Ltd" }).returning({ id: organisation.id });
    expect((await refusal(updateAliasIdentity(agency(), getAgencyActor(), { publicRef: created.publicRef, clientOrgId: stranger?.id ?? "" }))).code).toBe("invalid-input");
    expect((await refusal(updateAliasIdentity(agency(), getAgencyActor(), { publicRef: created.publicRef }))).code).toBe("invalid-input");
    expect((await refusal(updateAliasIdentity(agency(), getAgencyActor(), { publicRef: "ALI-ZZ9Z", jobTitle: "x" }))).code).toBe("not-found");
    await retireAliasIdentity(agency(), getAgencyActor(), { publicRef: created.publicRef });
    expect((await refusal(updateAliasIdentity(agency(), getAgencyActor(), { publicRef: created.publicRef, jobTitle: "Again" }))).code).toBe("invalid-transition");
  });

  it("retires an alias once, keeps the row, and lists it as archived", async () => {
    const created = await createAliasIdentity(agency(), rig.deps(), getAgencyActor(), input(rig.world().kestrel.id));
    const retired = await retireAliasIdentity(agency(), getAgencyActor(), { publicRef: created.publicRef });
    expect(retired.status).toBe("archived");
    expect((await refusal(retireAliasIdentity(agency(), getAgencyActor(), { publicRef: created.publicRef }))).code).toBe("invalid-transition");
    expect((await listAliasIdentities(agency(), getAgencyActor())).map((row) => row.status)).toEqual(["archived"]);
  });

  it("does not find or change another agency's alias", async () => {
    const created = await createAliasIdentity(agency(), rig.deps(), getAgencyActor(), input(rig.world().kestrel.id));
    const world = rig.world();
    const other = world.users.find((u) => u.organisation.id === world.northgate.id);
    if (other === undefined) throw new Error("No second agency user");
    const otherActor: TenantActor = { userId: other.id, orgId: world.northgate.id, orgKind: "agency", role: "manager" };
    expect((await refusal(retireAliasIdentity(agency(), otherActor, { publicRef: created.publicRef }))).code).toBe("not-found");
    expect((await refusal(updateAliasIdentity(agency(), otherActor, { publicRef: created.publicRef, jobTitle: "Hijacked" }))).code).toBe("not-found");
  });
});
