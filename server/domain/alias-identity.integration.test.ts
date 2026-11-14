import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { aliasIdentity } from "@/server/db/schema";
import {
  createAliasIdentity,
  listAliasIdentities,
  verifyAliasCode,
  type TenantActor,
} from "@/server/domain/alias-identity";
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

describe("createAliasIdentity", () => {
  it("creates an alias identity with a generated publicRef and 6-digit code", async () => {
    const actor = getAgencyActor();
    const created = await createAliasIdentity(rig.dbs.roles.leads_agency.db, rig.deps(), actor, {
      clientBrandName: "Kestrel",
      displayName: "Alex Croft",
      jobTitle: "Security SDR",
      aliasEmail: "alex@kestrel-outreach.example",
    });

    expect(created.publicRef).toMatch(/^ALI-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(created.clientBrandName).toBe("Kestrel");
    expect(created.displayName).toBe("Alex Croft");
    expect(created.jobTitle).toBe("Security SDR");
    expect(created.aliasEmail).toBe("alex@kestrel-outreach.example");
    expect(created.verifiedAt).toBeNull();
    expect(created.status).toBe("active");
    expect(created.verificationCode).toMatch(/^\d{6}$/);

    const [row] = await rig.dbs.owner.db
      .select()
      .from(aliasIdentity)
      .where(eq(aliasIdentity.publicRef, created.publicRef));
    expect(row?.verificationCodeHash).not.toBeNull();
  });

  it("refuses duplicate alias for the same member, client brand and email", async () => {
    const actor = getAgencyActor();
    const input = {
      clientBrandName: "Kestrel",
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
        clientBrandName: "Kestrel",
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
      clientBrandName: "Kestrel",
      displayName: "Alex Croft",
      jobTitle: "Security SDR",
      aliasEmail: "alex@kestrel-outreach.example",
    });

    const verified = await verifyAliasCode(rig.dbs.roles.leads_agency.db, rig.deps(), actor, {
      publicRef: created.publicRef,
      code: created.verificationCode,
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
      clientBrandName: "Kestrel",
      displayName: "Alex Croft",
      jobTitle: "Security SDR",
      aliasEmail: "alex@kestrel-outreach.example",
    });

    const wrongCode = created.verificationCode === "123456" ? "654321" : "123456";
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
      clientBrandName: "Kestrel",
      displayName: "Alex Croft",
      jobTitle: "Security SDR",
      aliasEmail: "alex@kestrel-outreach.example",
    });

    const list = await listAliasIdentities(rig.dbs.roles.leads_agency.db, actor);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0]?.clientBrandName).toBe("Kestrel");
  });
});
