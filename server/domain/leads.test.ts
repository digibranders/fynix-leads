import { describe, expect, it } from "vitest";
import type { Database } from "@/server/db/pool";
import { DomainError } from "@/server/domain/errors";
import { clientReviewLead, disputeLead, submitLead } from "./leads";

describe("leads domain service", () => {
  const dummyDb = {} as unknown as Database;
  const deps = {
    now: () => new Date("2026-12-01T12:00:00Z"),
    randomBytes: (n: number) => Buffer.alloc(n, 7),
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

  const validLeadInput = {
    campaignId: "55555555-5555-4555-8555-555555555555",
    aliasIdentityId: "66666666-6666-4666-8666-666666666666",
    hostMemberId: "77777777-7777-4777-8777-777777777777",
    prospectName: "Alex Vance",
    prospectTitle: "Head of Infrastructure",
    prospectCompany: "Black Mesa",
    prospectDomain: "blackmesa.gov",
    prospectLinkedinUrl: "https://linkedin.com/in/alexvance",
    prospectEmail: "alex@blackmesa.gov",
    bantBudget: "Budget confirmed",
    bantAuthority: "Sign-off authority",
    bantNeed: "Data pipelines",
    bantTimeline: "Q2",
    proposedTimes: ["2026-12-05T14:00:00Z"],
  };

  describe("submitLead authorization", () => {
    it("refuses client actors from submitting leads", async () => {
      await expect(
        submitLead(dummyDb, deps, clientActor, validLeadInput),
      ).rejects.toThrow(DomainError);
    });

    it("throws invalid-input on malformed input", async () => {
      await expect(
        submitLead(dummyDb, deps, agencyActor, { ...validLeadInput, prospectEmail: "not-an-email" }),
      ).rejects.toThrow(DomainError);
    });
  });

  describe("clientReviewLead authorization", () => {
    it("refuses agency actors from reviewing leads", async () => {
      await expect(
        clientReviewLead(dummyDb, deps, agencyActor, {
          leadId: "88888888-8888-4888-8888-888888888888",
          action: "accept",
          selectedMeetingTime: "2026-12-05T14:00:00Z",
        }),
      ).rejects.toThrow(DomainError);
    });
  });

  describe("disputeLead authorization", () => {
    it("refuses agency actors from disputing leads", async () => {
      await expect(
        disputeLead(dummyDb, deps, agencyActor, {
          leadId: "88888888-8888-4888-8888-888888888888",
          disputeReason: "Wrong qualification",
        }),
      ).rejects.toThrow(DomainError);
    });
  });
});
