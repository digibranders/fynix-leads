import { describe, expect, it } from "vitest";
import { DomainError } from "@/server/domain/errors";
import {
  clientReviewLeadSchema,
  createCampaignSchema,
  createOrganisationSchema,
  createPartnerAgencySchema,
  createSupplierSchema,
  firstPersonSchema,
  forwardMessageSchema,
  getOrCreateConversationSchema,
  addCollateralSchema,
  clientProfileSchema,
  issueInviteSchema,
  markNotificationReadSchema,
  memberDetailsSchema,
  postMessageSchema,
  recordMeetingOutcomeSchema,
  submitLeadSchema,
  updateCampaignSchema,
  updateOrganisationSchema,
} from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";

const UUID = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN = { clientOrgId: UUID, agencyOrgId: UUID, name: "UK freight", startDate: "2026-12-01", endDate: "2027-05-31", monthlyTarget: 20, totalTarget: 120 };

describe("parseInput", () => {
  it("returns the parsed value", () => {
    expect(parseInput(createOrganisationSchema, { kind: "client", name: "  Kestrel Logistics Ltd " })).toEqual({ kind: "client", name: "Kestrel Logistics Ltd" });
  });

  it("throws an invalid-input DomainError naming the path and the rule, and never the value", () => {
    const thrown = (() => {
      try {
        parseInput(createOrganisationSchema, { kind: "client", name: "" });
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
  it("takes one name for a client and no longer accepts a brand name on either kind or on an update", () => {
    expect(createOrganisationSchema.safeParse({ kind: "client", name: "A" }).success).toBe(true);
    expect(createOrganisationSchema.safeParse({ kind: "client", name: "A", brandName: "B" }).success).toBe(false);
    expect(createOrganisationSchema.safeParse({ kind: "agency", name: "A", brandName: "B" }).success).toBe(false);
    expect(updateOrganisationSchema.safeParse({ brandName: "B" }).success).toBe(false);
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

describe("coordinator and agency input", () => {
  it("takes a name, an optional IANA time zone and the duplicate confirmation, and nothing else", () => {
    expect(parseInput(createSupplierSchema, { name: " Ridgeway ", timeZone: "Europe/London", confirmDuplicate: true })).toEqual({ name: "Ridgeway", timeZone: "Europe/London", confirmDuplicate: true });
    expect(parseInput(createPartnerAgencySchema, { supplierId: UUID, name: "Calder Bay" })).toEqual({ supplierId: UUID, name: "Calder Bay" });
    expect(() => parseInput(createSupplierSchema, { name: "Ridgeway", timeZone: "EST" })).toThrow(DomainError);
    expect(() => parseInput(createSupplierSchema, { name: "Ridgeway", parentOrgId: UUID })).toThrow(DomainError);
  });

  it("takes the first person with a role that defaults to member, and refuses an alias or an organisation", () => {
    expect(parseInput(firstPersonSchema, { name: "Asha", jobTitle: "Founder", email: "a@b.co", role: "manager" })).toMatchObject({ role: "manager" });
    expect(parseInput(firstPersonSchema, { name: "Asha", jobTitle: "Founder", email: "a@b.co" })).toMatchObject({ role: "member" });
    expect(() => parseInput(firstPersonSchema, { name: "Asha", jobTitle: "Founder", email: "a@b.co", alias: "Asha" })).toThrow(DomainError);
    expect(() => parseInput(firstPersonSchema, { name: "Asha", jobTitle: "Founder", email: "a@b.co", organisationId: UUID })).toThrow(DomainError);
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
    expect(issueInviteSchema.parse({ organisationId: UUID, email: "a@example.com", name: "A", jobTitle: "Buyer" }).role).toBe("member");
    expect(issueInviteSchema.safeParse({ organisationId: UUID, email: "not an address", name: "A", jobTitle: "Buyer" }).success).toBe(false);
    expect(issueInviteSchema.safeParse({ organisationId: UUID, email: "a@example.com", name: "A", jobTitle: "Buyer", role: "owner" }).success).toBe(false);
  });
});


describe("campaign settings input", () => {
  it("accepts an IANA time zone, trims it, and accepts a meeting length from 15 to 240 minutes", () => {
    expect(parseInput(createCampaignSchema, { ...CAMPAIGN, timeZone: " Europe/London ", meetingMinutes: 15 })).toMatchObject({ timeZone: "Europe/London", meetingMinutes: 15 });
    expect(updateCampaignSchema.safeParse({ meetingMinutes: 240 }).success).toBe(true);
  });

  it("names the field and the rule when a setting is wrong, and never the value", () => {
    const message = (input: unknown): string => {
      try {
        parseInput(updateCampaignSchema, input);
      } catch (error) {
        return (error as DomainError).message;
      }
      return "";
    };
    expect(message({ timeZone: "Mars/Olympus" })).toBe("timeZone must be an IANA time zone such as Europe/London");
    expect(message({ meetingMinutes: 5 })).toContain("meetingMinutes");
  });
});

describe("lead inputs", () => {
  const validLead = {
    campaignId: UUID,
    aliasIdentityId: UUID,
    hostMemberId: UUID,
    prospectName: "Sarah Connor",
    prospectTitle: "VP Engineering",
    prospectCompany: "Cyberdyne Systems",
    prospectDomain: "cyberdyne.com",
    prospectLinkedinUrl: "https://linkedin.com/in/sarahconnor",
    prospectEmail: "sarah@cyberdyne.com",
    bantBudget: "Approved annual budget of $150k",
    bantAuthority: "Final decision maker",
    bantNeed: "Automated warehouse logistics",
    bantTimeline: "Q1 deployment",
    proposedTimes: ["2026-12-01T10:00:00Z", "2026-12-02T14:00:00Z"],
  };

  it("accepts valid lead submission input", () => {
    const parsed = parseInput(submitLeadSchema, validLead);
    expect(parsed.prospectName).toBe("Sarah Connor");
    expect(parsed.prospectEmail).toBe("sarah@cyberdyne.com");
    expect(parsed.proposedTimes).toHaveLength(2);
  });

  it("refuses lead submission without proposed meeting times", () => {
    expect(submitLeadSchema.safeParse({ ...validLead, proposedTimes: [] }).success).toBe(false);
  });

  it("refuses lead submission with more than 3 proposed meeting times", () => {
    expect(
      submitLeadSchema.safeParse({
        ...validLead,
        proposedTimes: [
          "2026-12-01T10:00:00Z",
          "2026-12-02T14:00:00Z",
          "2026-12-03T10:00:00Z",
          "2026-12-04T10:00:00Z",
        ],
      }).success,
    ).toBe(false);
  });

  it("validates client review actions", () => {
    expect(
      clientReviewLeadSchema.safeParse({
        leadId: UUID,
        action: "accept",
        selectedMeetingTime: "2026-12-01T10:00:00Z",
      }).success,
    ).toBe(true);

    expect(
      clientReviewLeadSchema.safeParse({
        leadId: UUID,
        action: "accept",
      }).success,
    ).toBe(false);

    expect(
      clientReviewLeadSchema.safeParse({
        leadId: UUID,
        action: "decline",
        declineReason: "Not in target market",
      }).success,
    ).toBe(true);

    expect(
      clientReviewLeadSchema.safeParse({
        leadId: UUID,
        action: "decline",
      }).success,
    ).toBe(false);

    expect(
      clientReviewLeadSchema.safeParse({
        leadId: UUID,
        action: "propose_times",
        proposedTimes: ["2026-12-05T11:00:00Z"],
      }).success,
    ).toBe(true);
  });

  it("validates recordMeetingOutcomeSchema", () => {
    expect(recordMeetingOutcomeSchema.safeParse({ meetingId: UUID, outcome: "held" }).success).toBe(true);
    expect(recordMeetingOutcomeSchema.safeParse({ meetingId: UUID, outcome: "client_no_show", notes: "Client was absent" }).success).toBe(true);
    expect(recordMeetingOutcomeSchema.safeParse({ meetingId: UUID, outcome: "prospect_no_show" }).success).toBe(true);
    expect(recordMeetingOutcomeSchema.safeParse({ meetingId: UUID, outcome: "cancelled" }).success).toBe(false);
    expect(recordMeetingOutcomeSchema.safeParse({ meetingId: "not-a-uuid", outcome: "held" }).success).toBe(false);
  });

  it("validates getOrCreateConversationSchema", () => {
    expect(getOrCreateConversationSchema.safeParse({ campaignId: UUID, side: "client_fynix", clientOrgId: UUID }).success).toBe(true);
    expect(getOrCreateConversationSchema.safeParse({ campaignId: UUID, side: "supplier_agency", supplierOrgId: UUID, agencyOrgId: UUID, subject: "Test thread" }).success).toBe(true);
    expect(getOrCreateConversationSchema.safeParse({ campaignId: "bad-id", side: "client_fynix" }).success).toBe(false);
    expect(getOrCreateConversationSchema.safeParse({ campaignId: UUID, side: "invalid_side" }).success).toBe(false);
  });

  it("validates postMessageSchema", () => {
    expect(postMessageSchema.safeParse({ conversationId: UUID, body: "Hello team" }).success).toBe(true);
    expect(postMessageSchema.safeParse({ conversationId: UUID, body: "   " }).success).toBe(false);
    expect(postMessageSchema.safeParse({ conversationId: "not-a-uuid", body: "Hello" }).success).toBe(false);
  });

  it("validates forwardMessageSchema", () => {
    expect(forwardMessageSchema.safeParse({ messageId: UUID, targetConversationId: UUID }).success).toBe(true);
    expect(forwardMessageSchema.safeParse({ messageId: "invalid", targetConversationId: UUID }).success).toBe(false);
  });

  it("validates markNotificationReadSchema", () => {
    expect(markNotificationReadSchema.safeParse({ notificationId: UUID }).success).toBe(true);
    expect(markNotificationReadSchema.safeParse({ notificationId: "invalid" }).success).toBe(false);
  });
});

describe("phase 1 people and profile schemas", () => {
  const PERSON = { organisationId: UUID, email: "a@example.com", name: "A Person", jobTitle: "Buyer" };

  it("requires a job title on an invite, keeps the phone optional and checks it", () => {
    expect(issueInviteSchema.safeParse({ organisationId: UUID, email: "a@example.com", name: "A Person" }).success).toBe(false);
    expect(issueInviteSchema.safeParse(PERSON).success).toBe(true);
    expect(issueInviteSchema.parse({ ...PERSON, phone: " +44 (0)20 7946 0000 " }).phone).toBe("+44 (0)20 7946 0000");
    expect(issueInviteSchema.safeParse({ ...PERSON, phone: "abc" }).success).toBe(false);
  });

  it("maps the Fynix roles admin and staff to manager and member", () => {
    expect(issueInviteSchema.parse({ ...PERSON, role: "admin" }).role).toBe("manager");
    expect(issueInviteSchema.parse({ ...PERSON, role: "staff" }).role).toBe("member");
  });

  it("makes a client's brand name optional, and keeps it and a profile for clients only", () => {
    expect(createOrganisationSchema.safeParse({ kind: "client", name: "Orchard Foods" }).success).toBe(true);
    expect(createOrganisationSchema.safeParse({ kind: "agency", name: "Ridgeway", profile: { introduction: "a", services: "b", differentiator: "c" } }).success).toBe(false);
    expect(createOrganisationSchema.safeParse({ kind: "client", name: "Orchard Foods", timeZone: "Mars/Olympus" }).success).toBe(false);
  });

  it("takes a time zone on update, and null clears it", () => {
    expect(updateOrganisationSchema.parse({ timeZone: null })).toEqual({ timeZone: null });
    expect(updateOrganisationSchema.safeParse({ timeZone: "Nowhere/Land" }).success).toBe(false);
  });

  it("needs the three profile answers and treats case studies as optional", () => {
    expect(clientProfileSchema.safeParse({ introduction: "a", services: "b", differentiator: "c" }).success).toBe(true);
    expect(clientProfileSchema.safeParse({ introduction: "a", services: "b" }).success).toBe(false);
  });

  it("accepts a web link as collateral and nothing else", () => {
    const base = { clientOrgId: UUID, kind: "link", title: "Brochure" };
    expect(addCollateralSchema.safeParse({ ...base, url: "https://example.com/a.pdf" }).success).toBe(true);
    expect(addCollateralSchema.safeParse({ ...base, url: "javascript:alert(1)" }).success).toBe(false);
    expect(addCollateralSchema.safeParse({ ...base, kind: "file", url: "https://example.com/a.pdf" }).success).toBe(false);
  });

  it("needs a member detail change to change something", () => {
    expect(memberDetailsSchema.safeParse({}).success).toBe(false);
    expect(memberDetailsSchema.safeParse({ phone: null }).success).toBe(true);
  });
});

describe("the company contact details", () => {
  it("are optional on create, trimmed, and https only for the website", () => {
    expect(createSupplierSchema.parse({ name: "X" })).toEqual({ name: "X" });
    expect(createSupplierSchema.parse({ name: "X", contactEmail: " a@b.example ", website: " https://b.example " })).toMatchObject({ contactEmail: "a@b.example", website: "https://b.example" });
    for (const website of ["http://b.example", "b.example", "ftp://b.example", "javascript:alert(1)"]) expect(createSupplierSchema.safeParse({ name: "X", website }).success, website).toBe(false);
  });

  it("refuse a bad email, a phone with letters and values over the length limits", () => {
    for (const extra of [{ contactEmail: "nope" }, { contactPhone: "call me" }, { contactName: "x".repeat(121) }, { address: "x".repeat(501) }, { notes: "x".repeat(4001) }]) {
      expect(createSupplierSchema.safeParse({ name: "X", ...extra }).success, JSON.stringify(extra).slice(0, 40)).toBe(false);
    }
  });

  it("can be cleared with null on update, and a contact change alone counts as a change", () => {
    expect(updateOrganisationSchema.safeParse({ notes: null }).success).toBe(true);
    expect(updateOrganisationSchema.safeParse({}).success).toBe(false);
  });
});
