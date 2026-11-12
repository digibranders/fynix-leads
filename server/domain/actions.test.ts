import { beforeEach, describe, expect, it, vi } from "vitest";
import { INVITE_IDLE } from "@/lib/domain/invite-form-state";

/**
 * The accept-invite action with everything outside it replaced: the Next.js request APIs and the services. It proves the
 * wiring: which address is read, what is passed on, and how each result becomes a form state or a redirect.
 */

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}

const state = vi.hoisted(() => ({ requestHeaders: new Headers(), redeem: vi.fn(), signIn: vi.fn() }));

vi.mock("next/headers", () => ({ headers: async () => state.requestHeaders }));
vi.mock("next/navigation", () => ({
  redirect: (to: string): never => {
    throw new Redirected(to);
  },
}));
vi.mock("@/server/auth", () => ({ getAuthServices: () => ({ services: true }) }));
vi.mock("@/server/auth/sign-in", () => ({ signInWithPassword: state.signIn }));
vi.mock("@/server/domain", () => ({ getDomain: () => ({ deps: true }) }));
vi.mock("@/server/domain/redeem-invite", () => ({ redeemInvite: state.redeem }));

const { redeemInviteAction } = await import("./actions");

const form = (values: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
};
const FULL = { token: "T".repeat(43), password: "a long enough password", termsId: "terms-1", accept: "on" };
const redirectTarget = async (work: Promise<unknown>): Promise<string> => {
  try {
    await work;
  } catch (error) {
    if (error instanceof Redirected) return error.to;
    throw error;
  }
  throw new Error("Expected a redirect.");
};

beforeEach(() => {
  vi.clearAllMocks();
  state.requestHeaders = new Headers({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1" });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("redeemInviteAction", () => {
  it("passes the token, the password, the terms that were ticked and the proxy address (not x-forwarded-for) to the service", async () => {
    state.redeem.mockResolvedValue({ status: "invite-unavailable", reason: "invalid" });
    await redeemInviteAction(INVITE_IDLE, form(FULL));
    expect(state.redeem).toHaveBeenCalledWith({ deps: true }, { token: FULL.token, password: FULL.password, acceptedTermsId: "terms-1", address: "203.0.113.9" });
  });

  it("sends no accepted terms when the box was not ticked, even though the page carried a terms id", async () => {
    state.redeem.mockResolvedValue({ status: "terms-not-accepted" });
    const result = await redeemInviteAction(INVITE_IDLE, form({ ...FULL, accept: "" }));
    expect(state.redeem.mock.calls[0]?.[1]).toMatchObject({ acceptedTermsId: null });
    expect(result).toEqual({ status: "error", message: "Tick the box to accept the terms and continue." });
  });

  it("signs the person in with the password they chose and lands on the welcome page", async () => {
    state.redeem.mockResolvedValue({ status: "redeemed", userId: "u", email: "priya@kestrel.example", party: "client" });
    state.signIn.mockResolvedValue({ status: "signed-in", userId: "u", headers: new Headers() });
    expect(await redirectTarget(redeemInviteAction(INVITE_IDLE, form(FULL)))).toBe("/welcome");
    expect(state.signIn).toHaveBeenCalledWith({ services: true }, { email: "priya@kestrel.example", password: FULL.password, address: "203.0.113.9", headers: state.requestHeaders });
  });

  it("sends the person to the sign-in page when the account is ready but the sign-in could not be completed, whether it refused or failed", async () => {
    state.redeem.mockResolvedValue({ status: "redeemed", userId: "u", email: "priya@kestrel.example", party: "client" });
    state.signIn.mockResolvedValue({ status: "rate-limited", retryAfterSeconds: 60 });
    expect(await redirectTarget(redeemInviteAction(INVITE_IDLE, form(FULL)))).toBe("/sign-in?invite=accepted");
    state.signIn.mockRejectedValue(new Error("database is down for priya@kestrel.example"));
    expect(await redirectTarget(redeemInviteAction(INVITE_IDLE, form(FULL)))).toBe("/sign-in?invite=accepted");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("priya@kestrel.example");
  });

  it.each([
    [{ status: "weak-password", message: "Use at least 8 characters." }, { status: "error", message: "Use at least 8 characters." }],
    [{ status: "check-unavailable" }, { status: "error", message: "We could not check that password just now. Try again in a minute." }],
    [{ status: "account-exists" }, { status: "error", message: "This address already has an account. Ask your Fynix contact for help." }],
    [{ status: "terms-changed" }, { status: "terms-changed", message: "The terms were updated while you were reading. Read the new version and accept it to continue." }],
    [{ status: "rate-limited", retryAfterSeconds: 130 }, { status: "rate-limited", message: "Too many attempts. Try again in 3 minutes." }],
    [{ status: "invite-unavailable", reason: "expired" }, { status: "unavailable", reason: "expired", message: "This invite has expired. Ask Fynix to send you a new one." }],
    [{ status: "invite-unavailable", reason: "redeemed" }, { status: "unavailable", reason: "redeemed", message: "This invite has been used already. Sign in instead." }],
  ])("turns %j into the form state %j", async (result, expected) => {
    state.redeem.mockResolvedValue(result);
    expect(await redeemInviteAction(INVITE_IDLE, form(FULL))).toEqual(expected);
    expect(state.signIn).not.toHaveBeenCalled();
  });

  it("answers a fault with the neutral message and logs only the error's name", async () => {
    state.redeem.mockRejectedValue(Object.assign(new Error("connection refused for priya@kestrel.example"), { name: "DatabaseError" }));
    expect(await redeemInviteAction(INVITE_IDLE, form(FULL))).toEqual({ status: "error", message: "Something went wrong. Try again in a moment." });
    expect(vi.mocked(console.error).mock.calls).toEqual([["The accept-invite action failed", "DatabaseError"]]);
  });
});
