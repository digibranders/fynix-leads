import { describe, expect, it } from "vitest";
import { DomainError } from "@/server/domain/errors";
import {
  clientReviewLeadSchema,
  createCampaignSchema,
  createOrganisationSchema,
  disputeLeadSchema,
  forwardMessageSchema,
  getOrCreateConversationSchema,
  issueInviteSchema,
  markNotificationReadSchema,
  postMessageSchema,
  recordMeetingOutcomeSchema,
  resolveDisputeSchema,
  submitLeadSchema,
  updateCampaignSchema,
  updateOrganisationSchema,
} from "@/server/domain/inputs";
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

  it("validates dispute input and resolution input", () => {
    expect(disputeLeadSchema.safeParse({ leadId: UUID, disputeReason: "Short reason" }).success).toBe(true);
    expect(disputeLeadSchema.safeParse({ leadId: UUID, disputeReason: "No" }).success).toBe(false);
    expect(resolveDisputeSchema.safeParse({ leadId: UUID, resolution: "upheld" }).success).toBe(true);
    expect(resolveDisputeSchema.safeParse({ leadId: UUID, resolution: "rejected", note: "Valid lead" }).success).toBe(true);
    expect(resolveDisputeSchema.safeParse({ leadId: UUID, resolution: "other" }).success).toBe(false);
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
