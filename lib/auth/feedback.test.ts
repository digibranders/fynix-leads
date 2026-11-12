import { describe, expect, it } from "vitest";
import { feedbackFor } from "@/lib/auth/feedback";
import { IDLE } from "@/lib/auth/form-state";
import { BREACH_CHECK_UNAVAILABLE, GENERIC_FAILURE, signInMessage } from "@/lib/auth/messages";

describe("feedbackFor", () => {
  it("shows nothing for idle, sent and a dead link", () => {
    for (const state of [IDLE, { status: "sent", email: "a@b.co" } as const, { status: "invalid-link" } as const]) {
      expect(feedbackFor(state, "sign-in")).toEqual({ note: null, fieldError: null });
    }
  });

  it("shows a rate limit as an amber notice on every form", () => {
    const state = { status: "rate-limited", message: "Too many attempts. Try again in 2 minutes.", email: "" } as const;
    for (const form of ["sign-in", "forgot-password", "reset-password"] as const) {
      expect(feedbackFor(state, form)).toEqual({ note: { tone: "amber", message: state.message }, fieldError: null });
    }
  });

  it("shows a sign-in or forgot-password error as a red notice", () => {
    const state = { status: "error", message: signInMessage(), email: "a@b.co" } as const;
    expect(feedbackFor(state, "sign-in").note).toEqual({ tone: "red", message: signInMessage() });
    expect(feedbackFor(state, "forgot-password").fieldError).toBeNull();
  });

  it("puts a password problem under the reset field, and a fault or an unavailable check in a notice", () => {
    const error = (message: string) => ({ status: "error", message, email: "" }) as const;
    expect(feedbackFor(error("Use at least 8 characters."), "reset-password")).toEqual({ note: null, fieldError: "Use at least 8 characters." });
    expect(feedbackFor(error(BREACH_CHECK_UNAVAILABLE), "reset-password").note?.tone).toBe("amber");
    expect(feedbackFor(error(GENERIC_FAILURE), "reset-password").note?.tone).toBe("red");
  });
});
