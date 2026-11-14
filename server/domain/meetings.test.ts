import { describe, expect, it } from "vitest";
import type { Database } from "@/server/db/pool";
import { DomainError } from "@/server/domain/errors";
import {
  listAgencyMeetings,
  listClientMeetings,
  recordMeetingOutcome,
} from "./meetings";

describe("meetings domain service", () => {
  const dummyDb = {} as unknown as Database;
  const deps = {
    now: () => new Date("2026-12-10T15:00:00Z"),
    randomBytes: (n: number) => Buffer.alloc(n, 3),
  };

  const agencyActor = {
    userId: "11111111-1111-4111-8111-111111111111",
    orgId: "22222222-2222-4222-8222-222222222222",
    orgKind: "agency" as const,
    role: "member" as const,
  };

  const clientActor = {
    userId: "33333333-3333-4333-8333-333333333333",
    orgId: "44444444-4444-4444-8444-444444444444",
    orgKind: "client" as const,
    role: "manager" as const,
  };

  const invalidActor = {
    userId: "55555555-5555-4555-8555-555555555555",
    orgId: "66666666-6666-4666-8666-666666666666",
    orgKind: "fynix" as unknown as "client",
    role: "member" as const,
  };

  const meetingId = "77777777-7777-4777-8777-777777777777";

  describe("recordMeetingOutcome authorization & validation", () => {
    it("refuses unauthorized actor kinds", async () => {
      await expect(
        recordMeetingOutcome(dummyDb, deps, invalidActor, {
          meetingId,
          outcome: "held",
        }),
      ).rejects.toThrow(DomainError);
    });

    it("rejects invalid outcomes", async () => {
      await expect(
        recordMeetingOutcome(dummyDb, deps, clientActor, {
          meetingId,
          outcome: "invalid_status",
        }),
      ).rejects.toThrow(DomainError);
    });

    it("rejects malformed meetingId", async () => {
      await expect(
        recordMeetingOutcome(dummyDb, deps, clientActor, {
          meetingId: "not-a-valid-uuid",
          outcome: "held",
        }),
      ).rejects.toThrow(DomainError);
    });
  });

  describe("listClientMeetings authorization", () => {
    it("refuses agency actors from calling listClientMeetings", async () => {
      await expect(listClientMeetings(dummyDb, agencyActor)).rejects.toThrow(DomainError);
    });
  });

  describe("listAgencyMeetings authorization", () => {
    it("refuses client actors from calling listAgencyMeetings", async () => {
      await expect(listAgencyMeetings(dummyDb, clientActor)).rejects.toThrow(DomainError);
    });
  });
});
