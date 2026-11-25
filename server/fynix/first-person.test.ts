import { describe, expect, it } from "vitest";
import { firstInviteNotice, firstPersonBody, firstPersonProblems } from "@/server/fynix/first-person";

const form = (values: Record<string, string>) => (name: string): string => values[name] ?? "";

describe("firstPersonBody", () => {
  it("is nothing when the group is empty, even with a role chosen", () => {
    expect(firstPersonBody(form({ firstRole: "manager" }))).toBeUndefined();
    expect(firstPersonBody(form({ firstName: "  ", firstEmail: " " }))).toBeUndefined();
  });

  it("trims, defaults the role to manager and leaves out a blank phone", () => {
    expect(firstPersonBody(form({ firstName: " Asha Rao ", firstJobTitle: "Founder", firstEmail: " asha@ridgeway.example " }))).toEqual({ name: "Asha Rao", jobTitle: "Founder", email: "asha@ridgeway.example", role: "manager" });
    expect(firstPersonBody(form({ firstName: "A", firstJobTitle: "B", firstEmail: "a@b.co", firstPhone: "+44 20 7946 0000", firstRole: "member" }))).toMatchObject({ role: "member", phone: "+44 20 7946 0000" });
  });

  it("falls back to manager for a role it does not know", () => {
    expect(firstPersonBody(form({ firstName: "A", firstRole: "admin" }))?.role).toBe("manager");
  });
});

describe("firstPersonProblems", () => {
  it("has none for an empty group or a complete person", () => {
    expect(firstPersonProblems(form({}))).toEqual({});
    expect(firstPersonProblems(form({ firstName: "Asha Rao", firstJobTitle: "Founder", firstEmail: "asha@ridgeway.example" }))).toEqual({});
  });

  it("names the missing fields of a started group, on the form's own field names", () => {
    expect(firstPersonProblems(form({ firstName: "Asha Rao" }))).toEqual({ firstJobTitle: "Job title is required.", firstEmail: "Enter a valid email address." });
  });

  it("says an email is not valid without quoting it", () => {
    const problems = firstPersonProblems(form({ firstName: "Asha", firstJobTitle: "Founder", firstEmail: "nope" }));
    expect(problems).toEqual({ firstEmail: "Enter a valid email address." });
  });
});

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
