import { describe, expect, it } from "vitest";
import { agreementProgress } from "./campaign-agreement";

const T = new Date("2026-11-27T10:00:00Z");

describe("agreementProgress", () => {
  it("says the agreement is not published yet", () => {
    const progress = agreementProgress("client", null, false);
    expect(progress.step).toBe("not-published");
    expect(progress.sides).toEqual([]);
  });

  it("asks a side that has not accepted, and says how the other side stands", () => {
    const neither = agreementProgress("coordinator", { version: 2, clientAcceptedAt: null, coordinatorAcceptedAt: null }, false);
    expect(neither.step).toBe("you-accept");
    expect(neither.body).toContain("The client has not accepted it yet either.");
    const clientDone = agreementProgress("coordinator", { version: 2, clientAcceptedAt: T, coordinatorAcceptedAt: null }, false);
    expect(clientDone.body).toContain("The client has accepted it.");
    expect(clientDone.sides).toEqual([{ label: "Client", accepted: true }, { label: "Coordinator", accepted: false }]);
  });

  it("waits for the other side once this side has accepted", () => {
    const progress = agreementProgress("client", { version: 1, clientAcceptedAt: T, coordinatorAcceptedAt: null }, false);
    expect(progress.step).toBe("waiting-other");
    expect(progress.title).toBe("Waiting for the coordinator");
  });

  it("is in force when both have accepted, and tells Fynix can make it active only while it is not live", () => {
    const facts = { version: 3, clientAcceptedAt: T, coordinatorAcceptedAt: T };
    expect(agreementProgress("client", facts, false).body).toContain("Fynix can now make the campaign active");
    expect(agreementProgress("client", facts, true).body).toBe("Version 3 is in force.");
  });

  it("writes no dash and no exclamation mark", () => {
    for (const side of ["client", "coordinator"] as const) {
      for (const facts of [null, { version: 1, clientAcceptedAt: null, coordinatorAcceptedAt: null }, { version: 1, clientAcceptedAt: T, coordinatorAcceptedAt: null }, { version: 1, clientAcceptedAt: T, coordinatorAcceptedAt: T }]) {
        const progress = agreementProgress(side, facts, false);
        expect(`${progress.title} ${progress.body}`).not.toMatch(/[\u2013\u2014!]/);
      }
    }
  });
});
