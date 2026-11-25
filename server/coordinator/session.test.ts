import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionContext } from "@/server/auth/session-context";

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

const { requireCoordinator } = await import("./session");

const base = { userId: "33333333-3333-4333-8333-333333333333", name: "Rahul Verma", sessionId: "s", orgId: "o" } as const;

beforeEach(() => {
  state.context = null;
});

describe("requireCoordinator", () => {
  it("sends an unauthenticated user to sign in", async () => {
    await expect(requireCoordinator()).rejects.toMatchObject({ to: "/sign-in" });
  });

  it("gives Fynix or client users not-found", async () => {
    state.context = { ...base, kind: "fynix", role: "leads_fynix", memberRole: "manager" };
    await expect(requireCoordinator()).rejects.toBeInstanceOf(NotFound);
    state.context = { ...base, kind: "client", role: "leads_client", memberRole: "manager" };
    await expect(requireCoordinator()).rejects.toBeInstanceOf(NotFound);
  });

  it("resolves view for agency session", async () => {
    state.context = { ...base, kind: "agency", role: "leads_agency", memberRole: "manager" };
    expect(await requireCoordinator()).toEqual({
      actor: { userId: base.userId, orgId: base.orgId, orgKind: "agency", role: "manager" },
      name: "Rahul Verma",
      canWrite: true,
    });
  });
});
