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

const { requireClient } = await import("./session");

const base = { userId: "22222222-2222-4222-8222-222222222222", name: "Simarpreet Singh", sessionId: "s", orgId: "o" } as const;

beforeEach(() => {
  state.context = null;
});

describe("requireClient", () => {
  it("sends a visitor who is not signed in to the sign-in page", async () => {
    await expect(requireClient()).rejects.toMatchObject({ to: "/sign-in" });
  });

  it("gives Fynix or agency user not-found", async () => {
    state.context = { ...base, kind: "fynix", role: "leads_fynix", memberRole: "manager" };
    await expect(requireClient()).rejects.toBeInstanceOf(NotFound);
    state.context = { ...base, kind: "agency", role: "leads_agency", memberRole: "member" };
    await expect(requireClient()).rejects.toBeInstanceOf(NotFound);
  });

  it("lets a client manager write and a client member read", async () => {
    state.context = { ...base, kind: "client", role: "leads_client", memberRole: "manager" };
    expect(await requireClient()).toEqual({
      actor: { userId: base.userId, orgId: base.orgId, orgKind: "client", role: "manager" },
      name: "Simarpreet Singh",
      canWrite: true,
    });

    state.context = { ...base, kind: "client", role: "leads_client", memberRole: "member" };
    expect(await requireClient()).toEqual({
      actor: { userId: base.userId, orgId: base.orgId, orgKind: "client", role: "member" },
      name: "Simarpreet Singh",
      canWrite: false,
    });
  });
});
