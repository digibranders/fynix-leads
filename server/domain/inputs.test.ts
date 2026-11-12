import { describe, expect, it } from "vitest";
import { DomainError } from "@/server/domain/errors";
import { createCampaignSchema, createOrganisationSchema, issueInviteSchema, updateCampaignSchema, updateOrganisationSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";

const UUID = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN = { clientOrgId: UUID, agencyOrgId: UUID, name: "UK freight", startDate: "2026-12-01", endDate: "2027-05-31", monthlyTarget: 20, totalTarget: 120 };

describe("parseInput", () => {
  it("returns the parsed value", () => {
    expect(parseInput(createOrganisationSchema, { kind: "client", name: "  Kestrel Logistics Ltd ", brandName: "Kestrel" })).toEqual({ kind: "client", name: "Kestrel Logistics Ltd", brandName: "Kestrel" });
  });

  it("throws an invalid-input DomainError naming the path and the rule, and never the value", () => {
    const thrown = (() => {
      try {
        parseInput(createOrganisationSchema, { kind: "client", name: "", brandName: "Kestrel" });
      } catch (error) {
        return error;
      }
    })();
    expect(thrown).toBeInstanceOf(DomainError);
    expect((thrown as DomainError).code).toBe("invalid-input");
    expect((thrown as DomainError).message).toBe("name is required");
  });
});

describe("organisation input", () => {
  it("needs a brand name for a client and refuses one for an agency", () => {
    expect(createOrganisationSchema.safeParse({ kind: "client", name: "A" }).success).toBe(false);
    expect(createOrganisationSchema.safeParse({ kind: "agency", name: "A", brandName: "B" }).success).toBe(false);
    expect(createOrganisationSchema.safeParse({ kind: "agency", name: "A" }).success).toBe(true);
  });

  it("refuses a Fynix organisation and any field it does not know", () => {
    expect(createOrganisationSchema.safeParse({ kind: "fynix", name: "A" }).success).toBe(false);
    expect(createOrganisationSchema.safeParse({ kind: "agency", name: "A", status: "archived" }).success).toBe(false);
  });

  it("an update must change something", () => {
    expect(updateOrganisationSchema.safeParse({}).success).toBe(false);
    expect(updateOrganisationSchema.safeParse({ name: "B" }).success).toBe(true);
  });
});

describe("campaign input", () => {
  it("accepts the minimum and the full set of requirement fields", () => {
    expect(createCampaignSchema.safeParse(CAMPAIGN).success).toBe(true);
    const full = createCampaignSchema.safeParse({ ...CAMPAIGN, geography: "UK", industries: ["Freight"], companySize: "50 to 500", icp: "icp", jobTitles: ["Head of Operations"], seniority: "Director", technologies: ["SAP"], bantBudget: "b", bantAuthority: "a", bantNeed: "n", bantTimeline: "t", instructions: "i", internalNotes: "n" });
    expect(full.success).toBe(true);
  });

  it.each([
    ["an end date before the start date", { endDate: "2026-11-30" }],
    ["a date that is not a date", { startDate: "2026-13-45" }],
    ["a negative target", { monthlyTarget: -1 }],
    ["a fractional target", { totalTarget: 1.5 }],
    ["a status (a new campaign is always a draft)", { status: "active" }],
    ["a list entry that is empty", { industries: [""] }],
    ["more than 30 list entries", { technologies: Array.from({ length: 31 }, (_, index) => `t${index}`) }],
  ])("refuses %s", (_label, change) => {
    expect(createCampaignSchema.safeParse({ ...CAMPAIGN, ...change }).success).toBe(false);
  });

  it("an update refuses to move a campaign to another client or agency, and refuses an empty change", () => {
    expect(updateCampaignSchema.safeParse({ clientOrgId: UUID }).success).toBe(false);
    expect(updateCampaignSchema.safeParse({ agencyOrgId: UUID }).success).toBe(false);
    expect(updateCampaignSchema.safeParse({}).success).toBe(false);
    expect(updateCampaignSchema.safeParse({ status: "active", monthlyTarget: 5 }).success).toBe(true);
  });
});

describe("invite input", () => {
  it("lower-cases nothing itself, defaults the role and needs a real address", () => {
    expect(issueInviteSchema.parse({ organisationId: UUID, email: "a@example.com", name: "A" }).role).toBe("member");
    expect(issueInviteSchema.safeParse({ organisationId: UUID, email: "not an address", name: "A" }).success).toBe(false);
    expect(issueInviteSchema.safeParse({ organisationId: UUID, email: "a@example.com", name: "A", role: "owner" }).success).toBe(false);
  });
});
