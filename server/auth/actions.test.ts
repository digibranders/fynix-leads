import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE } from "@/lib/auth/form-state";

/**
 * The server actions with everything outside them replaced: the Next.js request APIs, and the three services. They prove
 * the wiring: which address is read, what is passed on, and how each result becomes a form state or a redirect.
 */

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}

const state = vi.hoisted(() => ({
  requestHeaders: new Headers(),
  signIn: vi.fn(),
  requestReset: vi.fn(),
  completeReset: vi.fn(),
  signOut: vi.fn(),
  changePassword: vi.fn(),
  session: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => state.requestHeaders }));
vi.mock("next/navigation", () => ({
  redirect: (to: string): never => {
    throw new Redirected(to);
  },
}));
vi.mock("@/server/auth", () => ({ getAuthServices: () => ({ services: true }), getAuth: () => ({ api: { signOut: state.signOut } }), getSessionContext: () => state.session() }));
vi.mock("@/server/auth/change-password", () => ({ changeOwnPassword: state.changePassword }));
vi.mock("@/server/auth/sign-in", () => ({ signInWithPassword: state.signIn }));
vi.mock("@/server/auth/password-reset", () => ({ requestPasswordReset: state.requestReset, completePasswordReset: state.completeReset }));

const { changePasswordAction, completePasswordResetAction, requestPasswordResetAction, signInAction, signOutAction } = await import("./actions");

const form = (values: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
};
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

describe("signInAction", () => {
  it("passes the email, the password, the proxy address (not x-forwarded-for) and the request headers to the service", async () => {
    state.signIn.mockResolvedValue({ status: "invalid-credentials" });
    await signInAction(IDLE, form({ email: "a@example.com", password: "pw" }));
    expect(state.signIn).toHaveBeenCalledWith({ services: true }, { email: "a@example.com", password: "pw", address: "203.0.113.9", headers: state.requestHeaders });
  });

  it("redirects to the landing page after a sign-in, or to a safe next path", async () => {
    state.signIn.mockResolvedValue({ status: "signed-in", userId: "u", headers: new Headers() });
    expect(await redirectTarget(signInAction(IDLE, form({ email: "a@example.com", password: "pw" })))).toBe("/welcome");
    expect(await redirectTarget(signInAction(IDLE, form({ email: "a@example.com", password: "pw", next: "/client/review" })))).toBe("/client/review");
  });

  it("ignores a next path that points off the site", async () => {
    state.signIn.mockResolvedValue({ status: "signed-in", userId: "u", headers: new Headers() });
    expect(await redirectTarget(signInAction(IDLE, form({ email: "a@example.com", password: "pw", next: "//evil.example" })))).toBe("/welcome");
  });

  it("returns the message and the typed email, never the password, for a failed sign-in", async () => {
    state.signIn.mockResolvedValue({ status: "invalid-credentials" });
    const result = await signInAction(IDLE, form({ email: "a@example.com", password: "secret-value" }));
    expect(result).toEqual({ status: "error", message: "That email and password do not match an account.", email: "a@example.com" });
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });

  it("says how long to wait when rate limited", async () => {
    state.signIn.mockResolvedValue({ status: "rate-limited", retryAfterSeconds: 90 });
    expect(await signInAction(IDLE, form({ email: "a@example.com", password: "pw" }))).toEqual({ status: "rate-limited", message: "Too many attempts. Try again in 2 minutes.", email: "a@example.com" });
  });

  it("turns a fault into a neutral message and logs only the error name", async () => {
    state.signIn.mockRejectedValue(new TypeError("connect ECONNREFUSED with a@example.com in the text"));
    expect(await signInAction(IDLE, form({ email: "a@example.com", password: "pw" }))).toEqual({ status: "error", message: "Something went wrong. Try again in a moment.", email: "a@example.com" });
    expect(console.error).toHaveBeenCalledWith("An auth action failed", "TypeError");
  });
});

describe("requestPasswordResetAction", () => {
  it("answers sent whatever the service says about the address, and echoes only the email", async () => {
    state.requestReset.mockResolvedValue({ status: "sent" });
    expect(await requestPasswordResetAction(IDLE, form({ email: "a@example.com" }))).toEqual({ status: "sent", email: "a@example.com" });
    expect(state.requestReset).toHaveBeenCalledWith({ services: true }, { email: "a@example.com", address: "203.0.113.9" });
  });

  it("reports a rate limit", async () => {
    state.requestReset.mockResolvedValue({ status: "rate-limited", retryAfterSeconds: 3000 });
    expect((await requestPasswordResetAction(IDLE, form({ email: "a@example.com" }))).status).toBe("rate-limited");
  });
});

describe("completePasswordResetAction", () => {
  const submit = () => completePasswordResetAction(IDLE, form({ token: "tok", password: "a-long-new-passphrase" }));

  it("passes the token and the new password on, and redirects to sign-in on success", async () => {
    state.completeReset.mockResolvedValue({ status: "reset" });
    expect(await redirectTarget(submit())).toBe("/sign-in?reset=1");
    expect(state.completeReset).toHaveBeenCalledWith({ services: true }, { token: "tok", newPassword: "a-long-new-passphrase", address: "203.0.113.9" });
  });

  it.each([
    [{ status: "invalid-token" }, { status: "invalid-link" }],
    [{ status: "check-unavailable" }, { status: "error", message: "We could not check that password just now. Try again in a minute.", email: "" }],
    [{ status: "weak-password", message: "Use at least 8 characters." }, { status: "error", message: "Use at least 8 characters.", email: "" }],
    [{ status: "rate-limited", retryAfterSeconds: 60 }, { status: "rate-limited", message: "Too many attempts. Try again in 1 minute.", email: "" }],
  ])("maps %j to a form state", async (serviceResult, expected) => {
    state.completeReset.mockResolvedValue(serviceResult);
    expect(await submit()).toEqual(expected);
  });
});

describe("signOutAction", () => {
  it("ends the session with the request's own cookie and redirects to sign-in", async () => {
    state.signOut.mockResolvedValue({ success: true });
    expect(await redirectTarget(signOutAction())).toBe("/sign-in?signed-out=1");
    expect(state.signOut).toHaveBeenCalledWith({ headers: state.requestHeaders });
  });
});

describe("changePasswordAction", () => {
  const signedIn = { userId: "user-1" };
  const send = () => changePasswordAction({ status: "idle" }, form({ currentPassword: "old-secret-1!", newPassword: "new-secret-2!" }));

  it("passes the account, both passwords and the request headers to the service, and says the change is done", async () => {
    state.session.mockResolvedValue(signedIn);
    state.changePassword.mockResolvedValue({ status: "changed" });
    expect(await send()).toEqual({ status: "done", redirectTo: null });
    expect(state.changePassword).toHaveBeenCalledWith({ services: true }, { userId: "user-1", currentPassword: "old-secret-1!", newPassword: "new-secret-2!", headers: state.requestHeaders });
  });

  it("needs a session, and never calls the service without one", async () => {
    state.session.mockResolvedValue(null);
    expect(await send()).toMatchObject({ status: "error", message: "Your session has ended. Sign in again." });
    expect(state.changePassword).not.toHaveBeenCalled();
  });

  it("puts each refusal on its own field and never gives a password back", async () => {
    state.session.mockResolvedValue(signedIn);
    state.changePassword.mockResolvedValueOnce({ status: "wrong-password" });
    const wrong = await send();
    expect(wrong).toMatchObject({ status: "error", message: null, fields: { currentPassword: "That is not your current password." } });
    state.changePassword.mockResolvedValueOnce({ status: "weak-password", message: "Use at least 8 characters." });
    const weak = await send();
    expect(weak).toMatchObject({ status: "error", fields: { newPassword: "Use at least 8 characters." } });
    for (const result of [wrong, weak]) {
      expect(JSON.stringify(result)).not.toContain("old-secret-1!");
      expect(JSON.stringify(result)).not.toContain("new-secret-2!");
    }
  });

  it("words a limit, a breach service outage and a fault", async () => {
    state.session.mockResolvedValue(signedIn);
    state.changePassword.mockResolvedValueOnce({ status: "rate-limited", retryAfterSeconds: 600 });
    expect(await send()).toMatchObject({ status: "error", message: "Too many attempts. Try again in 10 minutes." });
    state.changePassword.mockResolvedValueOnce({ status: "check-unavailable" });
    expect(await send()).toMatchObject({ status: "error", message: "We could not check that password just now. Try again in a minute." });
    state.changePassword.mockRejectedValueOnce(new Error("secret@example.com down"));
    const fault = await send();
    expect(fault).toMatchObject({ status: "error", message: "Something went wrong. Try again in a moment." });
    expect(JSON.stringify(fault)).not.toContain("secret@example.com");
  });
});
