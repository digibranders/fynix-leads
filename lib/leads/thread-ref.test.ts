import { describe, expect, it } from "vitest";
import { leadRefFromSubject, threadHref } from "./thread-ref";

describe("leadRefFromSubject", () => {
  it("reads the reference out of a lead thread's title", () => {
    expect(leadRefFromSubject("Lead LEAD-7K2M")).toBe("LEAD-7K2M");
    expect(leadRefFromSubject("Questions about the brief")).toBeNull();
    expect(leadRefFromSubject(null)).toBeNull();
  });
});

describe("threadHref", () => {
  it("opens a thread in the person's own portal", () => {
    expect(threadHref("client", "abc")).toBe("/client/messages?conv=abc");
    expect(threadHref("agency", "abc")).toBe("/coordinator/messages?conv=abc");
    expect(threadHref("fynix", "abc")).toBe("/fynix/inbox?conv=abc");
  });
});
