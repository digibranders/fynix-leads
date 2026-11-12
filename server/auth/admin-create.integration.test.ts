import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFynixAdmin, FYNIX_ORGANISATION_REF, type AdminCreateServices } from "@/server/auth/admin-create";
import { AccountAlreadyExistsError } from "@/server/auth/create-account";
import { authErrorCode } from "@/server/auth/errors";
import { resolveSessionContext } from "@/server/auth/session-context";
import { signInWithPassword } from "@/server/auth/sign-in";
import { GOOD_PASSWORD, NEW_PASSWORD, openAuthRig, requestHeadersFrom, type AuthRig } from "@/server/auth/testing";
import type { Database } from "@/server/db/pool";
import { account, member, organisation, user } from "@/server/db/schema";
import { resetDatabase } from "@/server/db/testing";

/** `pnpm admin:create`'s logic: the first Fynix admin, from nothing, on the real test database. */

let rig: AuthRig;
let services: AdminCreateServices;

beforeAll(() => {
  rig = openAuthRig();
  services = { auth: rig.auth, authDb: rig.dbs.roles.leads_auth.db, ownerDb: rig.dbs.owner.db };
});
afterAll(async () => {
  await rig?.close();
});
beforeEach(async () => {
  await resetDatabase(rig.dbs.owner);
  rig.breach.breached.clear();
  rig.breach.unavailable = false;
});

const tableCount = async (table: typeof user | typeof member | typeof account | typeof organisation): Promise<number> =>
  (await rig.dbs.owner.db.select({ value: count() }).from(table))[0]?.value ?? 0;

describe("createFynixAdmin on an empty database", () => {
  it("creates the Fynix organisation, the account and a manager membership, and the admin can sign in as Fynix", async () => {
    const created = await createFynixAdmin(services, { email: "Asha@Fynix.example", name: "Asha Rao", password: GOOD_PASSWORD });
    expect(created).toMatchObject({ email: "asha@fynix.example", organisationRef: FYNIX_ORGANISATION_REF });

    const orgs = await rig.dbs.owner.db.select({ ref: organisation.publicRef, kind: organisation.kind }).from(organisation);
    expect(orgs).toEqual([{ ref: "ORG-FYNX", kind: "fynix" }]);
    const members = await rig.dbs.owner.db.select({ role: member.role, status: member.status, kind: member.orgKind, name: member.displayName }).from(member);
    expect(members).toEqual([{ role: "manager", status: "active", kind: "fynix", name: "Asha Rao" }]);

    const signedIn = await signInWithPassword(rig.services, { email: "asha@fynix.example", password: GOOD_PASSWORD, address: "203.0.113.90" });
    if (signedIn.status !== "signed-in") throw new Error("the new admin could not sign in");
    const context = await resolveSessionContext(rig.resolution, requestHeadersFrom(signedIn.headers));
    expect(context).toMatchObject({ kind: "fynix", role: "leads_fynix", userId: created.userId, memberRole: "manager" });
  });

  it("a second admin joins the same organisation", async () => {
    await createFynixAdmin(services, { email: "asha@fynix.example", name: "Asha Rao", password: GOOD_PASSWORD });
    await createFynixAdmin(services, { email: "ravi@fynix.example", name: "Ravi Shah", password: NEW_PASSWORD });
    expect(await tableCount(organisation)).toBe(1);
    expect(await tableCount(member)).toBe(2);
  });

  it("applies the password rules: a short, a breached or an unchecked password creates no account", async () => {
    await expect(createFynixAdmin(services, { email: "asha@fynix.example", name: "Asha Rao", password: "short" })).rejects.toSatisfy((error) => authErrorCode(error) === "WEAK_PASSWORD");
    rig.breach.breached.add(GOOD_PASSWORD);
    await expect(createFynixAdmin(services, { email: "asha@fynix.example", name: "Asha Rao", password: GOOD_PASSWORD })).rejects.toSatisfy((error) => authErrorCode(error) === "PASSWORD_BREACHED");
    rig.breach.breached.clear();
    rig.breach.unavailable = true;
    await expect(createFynixAdmin(services, { email: "asha@fynix.example", name: "Asha Rao", password: GOOD_PASSWORD })).rejects.toSatisfy((error) => authErrorCode(error) === "PASSWORD_CHECK_UNAVAILABLE");
    expect([await tableCount(user), await tableCount(account), await tableCount(member)]).toEqual([0, 0, 0]);
  });

  it("refuses an address that already has an account and changes nothing", async () => {
    await createFynixAdmin(services, { email: "asha@fynix.example", name: "Asha Rao", password: GOOD_PASSWORD });
    await expect(createFynixAdmin(services, { email: "asha@fynix.example", name: "Someone Else", password: NEW_PASSWORD })).rejects.toBeInstanceOf(AccountAlreadyExistsError);
    expect([await tableCount(user), await tableCount(member)]).toEqual([1, 1]);
    expect((await signInWithPassword(rig.services, { email: "asha@fynix.example", password: GOOD_PASSWORD, address: "203.0.113.91" })).status).toBe("signed-in");
  });

  it("refuses a malformed address and a blank name before anything is written", async () => {
    await expect(createFynixAdmin(services, { email: "not-an-email", name: "Asha", password: GOOD_PASSWORD })).rejects.toThrow();
    await expect(createFynixAdmin(services, { email: "asha@fynix.example", name: "   ", password: GOOD_PASSWORD })).rejects.toThrow("A name is required");
    expect([await tableCount(organisation), await tableCount(user)]).toEqual([0, 0]);
  });

  it("removes the account again if the membership cannot be written, so the address is free to try again", async () => {
    const failingOwner = new Proxy(rig.dbs.owner.db, {
      get(target, property, receiver) {
        if (property === "insert") {
          return (table: unknown) => {
            if (table === member) throw new Error("the membership insert failed");
            return target.insert(table as typeof organisation);
          };
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    }) as Database;
    await expect(createFynixAdmin({ ...services, ownerDb: failingOwner }, { email: "asha@fynix.example", name: "Asha Rao", password: GOOD_PASSWORD })).rejects.toThrow("membership insert failed");
    expect(await rig.dbs.owner.db.select({ id: user.id }).from(user).where(eq(user.email, "asha@fynix.example"))).toEqual([]);
    await expect(createFynixAdmin(services, { email: "asha@fynix.example", name: "Asha Rao", password: GOOD_PASSWORD })).resolves.toMatchObject({ email: "asha@fynix.example" });
  });

  it("the database allows only one Fynix organisation", async () => {
    await createFynixAdmin(services, { email: "asha@fynix.example", name: "Asha Rao", password: GOOD_PASSWORD });
    await expect(rig.dbs.owner.db.insert(organisation).values({ publicRef: "ORG-FYN2", kind: "fynix", name: "Another Fynix" })).rejects.toThrow();
  });
});
