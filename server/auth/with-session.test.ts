import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionContext } from "@/server/auth/session-context";

const calls: { readonly fn: string; readonly args: unknown[] }[] = [];

vi.mock("@/server/db/scope", () => ({
  withFynixScope: async (...args: unknown[]) => {
    calls.push({ fn: "withFynixScope", args: args.slice(0, 1) });
    return "fynix";
  },
  withOrgScope: async (...args: unknown[]) => {
    calls.push({ fn: "withOrgScope", args: args.slice(0, 2) });
    return "tenant";
  },
}));

const { withSessionScope } = await import("./with-session");

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const base = { userId: USER, name: "Pat Example", sessionId: "s", orgId: ORG, memberRole: "member" } as const;
const work = async (): Promise<string> => "unused";

beforeEach(() => {
  calls.length = 0;
});

describe("withSessionScope", () => {
  it("sends a Fynix session to the Fynix scope with the user only, never an organisation", async () => {
    const context: SessionContext = { ...base, kind: "fynix", role: "leads_fynix" };
    expect(await withSessionScope(context, work)).toBe("fynix");
    expect(calls).toEqual([{ fn: "withFynixScope", args: [{ userId: USER }] }]);
  });

  it.each([
    ["client", "leads_client"],
    ["agency", "leads_agency"],
  ] as const)("sends a %s session to its own role pool, scoped to its organisation and user", async (kind, role) => {
    const context: SessionContext = { ...base, kind, role };
    expect(await withSessionScope(context, work)).toBe("tenant");
    expect(calls).toEqual([{ fn: "withOrgScope", args: [role, { orgId: ORG, userId: USER }] }]);
  });
});
