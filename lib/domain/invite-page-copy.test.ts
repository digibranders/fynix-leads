import { describe, expect, it } from "vitest";
import { partyLabel } from "./invite-page-copy";

describe("partyLabel", () => {
  it("calls an agency with no coordinator above it a Coordinator, and a partner agency an Agency", () => {
    expect(partyLabel("agency", false)).toBe("Coordinator");
    expect(partyLabel("agency", true)).toBe("Agency");
  });

  it("leaves a client and Fynix as they were", () => {
    expect(partyLabel("client", false)).toBe("Client");
    expect(partyLabel("fynix", false)).toBe("Fynix");
  });
});
