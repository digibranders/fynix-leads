import { describe, expect, it } from "vitest";
import { domainMessage } from "@/server/fynix/errors";

describe("domainMessage", () => {
  it("tells staff to ask an admin", () => {
    expect(domainMessage("admin-required")).toBe("Only a Fynix admin can change this. Ask an admin.");
  });

  it("lets a screen say something more exact for one reason", () => {
    expect(domainMessage("invalid-transition", { "invalid-transition": "That person is a host already." })).toBe("That person is a host already.");
    expect(domainMessage("not-found", { "invalid-transition": "x" })).toBe("That no longer exists. Refresh the page and try again.");
  });
});
