import { describe, expect, it } from "vitest";
import { BREACH_CHECK_UNAVAILABLE, GENERIC_FAILURE } from "@/lib/auth/messages";
import { inviteFeedbackFor } from "@/lib/domain/invite-feedback";
import { ACCOUNT_EXISTS, TERMS_CHANGED, TERMS_NOT_ACCEPTED } from "@/lib/domain/invite-messages";
import { termsParagraphs } from "@/lib/domain/invite-page-copy";

describe("inviteFeedbackFor", () => {
  it("puts password messages under the field", () => {
    expect(inviteFeedbackFor({ status: "error", message: "Use at least 12 characters." }).passwordError).toBe("Use at least 12 characters.");
  });
  it("puts the box message by the box", () => {
    expect(inviteFeedbackFor({ status: "error", message: TERMS_NOT_ACCEPTED })).toMatchObject({ boxError: TERMS_NOT_ACCEPTED, passwordError: null, note: null });
  });
  it.each([BREACH_CHECK_UNAVAILABLE, GENERIC_FAILURE, ACCOUNT_EXISTS])("puts %s in the notice above the button", (message) => {
    expect(inviteFeedbackFor({ status: "error", message })).toMatchObject({ note: message, passwordError: null, boxError: null });
  });
  it("shows a rate limit above the button and a terms change above the terms", () => {
    expect(inviteFeedbackFor({ status: "rate-limited", message: "Too many attempts." }).note).toBe("Too many attempts.");
    expect(inviteFeedbackFor({ status: "terms-changed", message: TERMS_CHANGED }).termsNote).toBe(TERMS_CHANGED);
  });
  it("shows nothing for idle", () => {
    expect(inviteFeedbackFor({ status: "idle" })).toEqual({ note: null, termsNote: null, passwordError: null, boxError: null });
  });
});

describe("termsParagraphs", () => {
  it("splits on line breaks and blank lines and keeps markup as text", () => {
    expect(termsParagraphs("a\r\n\nb\n<b>c</b>\n")).toEqual(["a", "b", "<b>c</b>"]);
  });
});
