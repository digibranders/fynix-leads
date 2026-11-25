import { describe, expect, it } from "vitest";
import { firstInviteNotice } from "@/server/fynix/first-person";

describe("firstInviteNotice", () => {
  it("says nothing when no invite was asked for or it went out", () => {
    expect(firstInviteNotice("coordinator", { status: "none" })).toBeUndefined();
    expect(firstInviteNotice("coordinator", { status: "sent" })).toBeUndefined();
  });

  it("says plainly that the organisation was added but the invite was not sent, and why", () => {
    expect(firstInviteNotice("coordinator", { status: "failed", code: "no-current-terms" })).toBe(
      "The coordinator was added, but the invite was not sent: no terms are published for that kind of organisation yet, so an invite cannot go out.",
    );
    expect(firstInviteNotice("agency", { status: "failed", code: "email-in-use" })).toBe("The agency was added, but the invite was not sent: that email address already has an account.");
    expect(firstInviteNotice("agency", { status: "failed", code: null })).toMatch(/^The agency was added, but the invite was not sent: something went wrong/);
  });
});
