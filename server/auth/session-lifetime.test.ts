import { describe, expect, it } from "vitest";
import { SESSION_LIFETIME_SECONDS } from "@/lib/auth/session-lifetime";
import { organisationKind } from "@/server/db/schema";

describe("session lifetimes and the database", () => {
  it("define a lifetime for exactly the organisation kinds the database has", () => {
    expect(Object.keys(SESSION_LIFETIME_SECONDS).sort()).toEqual([...organisationKind.enumValues].sort());
  });
});
