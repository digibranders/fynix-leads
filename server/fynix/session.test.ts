import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionContext } from "@/server/auth/session-context";
import { DomainError } from "@/server/domain/errors";

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}
class NotFound extends Error {}

const state = vi.hoisted(() => ({ context: null as SessionContext | null }));

vi.mock("next/headers", () => ({ cookies: async () => ({ has: () => false }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string): never => {
    throw new Redirected(to);
  },
  notFound: (): never => {
    throw new NotFound("not found");
  },
}));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/server/auth", () => ({ getSessionContext: async () => state.context }));

const { orNotFound, requireFynix } = await import("./session");

const base = { userId: "11111111-1111-4111-8111-111111111111", name: "Meera Sethi", sessionId: "s", orgId: "o" } as const;
const fynix = (memberRole: "member" | "manager"): SessionContext => ({ ...base, kind: "fynix", role: "leads_fynix", memberRole });

beforeEach(() => {
  state.context = null;
});

describe("requireFynix", () => {
  it("sends a visitor who is not signed in to the sign-in page", async () => {
    await expect(requireFynix()).rejects.toMatchObject({ to: "/sign-in" });
  });

  it("gives a client or an agency user the not-found page, not a redirect", async () => {
    state.context = { ...base, kind: "client", role: "leads_client", memberRole: "manager" };
    await expect(requireFynix()).rejects.toBeInstanceOf(NotFound);
    state.context = { ...base, kind: "agency", role: "leads_agency", memberRole: "member" };
    await expect(requireFynix()).rejects.toBeInstanceOf(NotFound);
  });

  it("lets a Fynix admin write and Fynix staff read", async () => {
    state.context = fynix("manager");
    expect(await requireFynix()).toEqual({ actor: { userId: base.userId }, name: "Meera Sethi", canWrite: true, twoFactorEnabled: false });
    state.context = fynix("member");
    expect((await requireFynix()).canWrite).toBe(false);
  });
});

describe("REQUIRE_FYNIX_2FA", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is off by default: a Fynix person without the second step reaches every page", async () => {
    state.context = fynix("manager");
    expect((await requireFynix()).twoFactorEnabled).toBe(false);
  });

  it("when on, sends a Fynix person without the step to the profile page, and lets the profile page and layout in", async () => {
    vi.stubEnv("REQUIRE_FYNIX_2FA", "true");
    state.context = fynix("manager");
    await expect(requireFynix()).rejects.toMatchObject({ to: "/fynix/profile" });
    expect((await requireFynix({ allowWithoutSecondFactor: true })).canWrite).toBe(true);
  });

  it("when on, lets a Fynix person who has the step through, and leaves client and agency users alone", async () => {
    vi.stubEnv("REQUIRE_FYNIX_2FA", "true");
    state.context = { ...fynix("member"), twoFactorEnabled: true };
    expect((await requireFynix()).twoFactorEnabled).toBe(true);
    state.context = { ...base, kind: "client", role: "leads_client", memberRole: "manager" };
    await expect(requireFynix()).rejects.toBeInstanceOf(NotFound);
  });

  it("counts only the exact word true", async () => {
    for (const value of ["TRUE", "1", "yes", "false", ""]) {
      vi.stubEnv("REQUIRE_FYNIX_2FA", value);
      state.context = fynix("manager");
      await expect(requireFynix(), value).resolves.toBeDefined();
    }
  });
});

describe("orNotFound", () => {
  it("passes a result through, turns not-found and invalid-input into the not-found page, and lets a fault through", async () => {
    expect(await orNotFound(Promise.resolve(3))).toBe(3);
    await expect(orNotFound(Promise.reject(new DomainError("not-found", "x")))).rejects.toBeInstanceOf(NotFound);
    await expect(orNotFound(Promise.reject(new DomainError("invalid-input", "x")))).rejects.toBeInstanceOf(NotFound);
    await expect(orNotFound(Promise.reject(new DomainError("admin-required", "x")))).rejects.toMatchObject({ code: "admin-required" });
    await expect(orNotFound(Promise.reject(new Error("db down")))).rejects.toThrow("db down");
  });
});
