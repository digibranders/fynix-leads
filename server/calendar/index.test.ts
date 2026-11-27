import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { calendarSetupFromEnv, calendarSyncEnabled } from "./index";

const key = randomBytes(32).toString("base64url");

describe("the calendar switch", () => {
  it("is off unless it is exactly the word true, and then there is no set-up at all", () => {
    for (const value of [undefined, "", "false", "TRUE", "1", "yes"]) {
      expect(calendarSyncEnabled({ CALENDAR_SYNC_ENABLED: value })).toBe(false);
      expect(calendarSetupFromEnv({ CALENDAR_SYNC_ENABLED: value, CALENDAR_TOKEN_KEY: key, GOOGLE_CALENDAR_CLIENT_ID: "a".repeat(12), GOOGLE_CALENDAR_CLIENT_SECRET: "b".repeat(12) })).toBeNull();
    }
  });
  it("offers only the providers that have both an id and a secret", () => {
    const only = calendarSetupFromEnv({ CALENDAR_SYNC_ENABLED: "true", CALENDAR_TOKEN_KEY: key, GOOGLE_CALENDAR_CLIENT_ID: "a".repeat(12), GOOGLE_CALENDAR_CLIENT_SECRET: "b".repeat(12), MICROSOFT_CALENDAR_CLIENT_ID: "c".repeat(12) });
    expect(Object.keys(only?.providers ?? {})).toEqual(["google"]);
  });
  it("refuses to start without a key, naming the variable", () => {
    expect(() => calendarSetupFromEnv({ CALENDAR_SYNC_ENABLED: "true", GOOGLE_CALENDAR_CLIENT_ID: "a".repeat(12), GOOGLE_CALENDAR_CLIENT_SECRET: "b".repeat(12) })).toThrow("CALENDAR_TOKEN_KEY");
  });
});
