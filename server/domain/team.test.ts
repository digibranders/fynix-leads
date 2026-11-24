import { describe, expect, it } from "vitest";
import { teamState } from "./team";

const now = new Date("2026-11-24T12:00:00Z");

describe("teamState", () => {
  it("passes a person's status through", () => {
    expect(teamState("active", null, now)).toBe("active");
    expect(teamState("suspended", null, now)).toBe("suspended");
  });

  it("says an invite is waiting until it expires, then that it has lapsed", () => {
    expect(teamState("invited", new Date("2026-11-25T12:00:00Z"), now)).toBe("invited");
    expect(teamState("invited", new Date("2026-11-24T12:00:00Z"), now)).toBe("invite-expired");
    expect(teamState("invited", null, now)).toBe("invite-expired");
  });
});
