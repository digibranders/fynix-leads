import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionContext } from "@/server/auth/session-context";

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}

const state = vi.hoisted(() => ({ context: null as SessionContext | null, cookieNames: [] as string[] }));

vi.mock("next/headers", () => ({ cookies: async () => ({ has: (name: string) => state.cookieNames.includes(name) }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string): never => {
    throw new Redirected(to);
  },
}));
vi.mock("@/server/auth", () => ({ getSessionContext: async () => state.context }));

const { requireSessionContext } = await import("./guard");

const CONTEXT: SessionContext = { kind: "client", role: "leads_client", userId: "u", name: "Pat", sessionId: "s", orgId: "o", memberRole: "member" };

beforeEach(() => {
  state.context = null;
  state.cookieNames = [];
});

describe("requireSessionContext", () => {
  it("returns the context of a signed-in user", async () => {
    state.context = CONTEXT;
    expect(await requireSessionContext()).toBe(CONTEXT);
  });

  it("sends a visitor with no cookie to the sign-in page, with no notice", async () => {
    await expect(requireSessionContext()).rejects.toMatchObject({ to: "/sign-in" });
  });

  it("sends a visitor whose cookie no longer resolves to the sign-in page with the ended-session notice", async () => {
    state.cookieNames = ["fynix-leads.session_token"];
    await expect(requireSessionContext()).rejects.toMatchObject({ to: "/sign-in?reason=ended" });
  });
});
