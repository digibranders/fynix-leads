import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fieldErrors, issueSentence } from "@/lib/fynix/form-state";
import { createPartnerAgencySchema, issueInviteSchema, publishAgreementSchema, setCampaignShareSchema, createSupplierSchema } from "@/server/domain/inputs";

const labels = { agencyOrgId: "Agency", name: "Name", email: "Email", monthlyTarget: "Per month", totalTarget: "In total", monthlyShare: "Monthly share", supplierId: "Coordinator" };
const errorsOf = (schema: z.ZodType, input: unknown) => {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("Expected the input to fail");
  return fieldErrors(result.error, labels);
};

describe("fieldErrors with the real domain schemas", () => {
  it("says a name is required", () => {
    expect(errorsOf(createSupplierSchema, { name: "   " })).toEqual({ name: "Name is required." });
    expect(errorsOf(createSupplierSchema, { name: "x".repeat(121) })).toEqual({ name: "Name must be at most 120 characters." });
  });

  it("says an email is not valid without quoting it", () => {
    const errors = errorsOf(issueInviteSchema, { organisationId: "5b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b", email: "not-an-email", name: "A", alias: "B" });
    expect(errors).toEqual({ email: "Enter a valid email address." });
    expect(JSON.stringify(errors)).not.toContain("not-an-email");
  });

  it("says a number is missing, not whole, too small or too big", () => {
    const base = { campaignId: "5b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b", party: "client", totalTarget: 10 };
    expect(errorsOf(publishAgreementSchema, base)).toEqual({ monthlyTarget: "Per month is required." });
    expect(errorsOf(publishAgreementSchema, { ...base, monthlyTarget: Number.NaN })).toEqual({ monthlyTarget: "Per month must be a whole number." });
    expect(errorsOf(publishAgreementSchema, { ...base, monthlyTarget: 2.5 })).toEqual({ monthlyTarget: "Per month must be a whole number." });
    expect(errorsOf(publishAgreementSchema, { ...base, monthlyTarget: -1 })).toEqual({ monthlyTarget: "Per month must be at least 0." });
    expect(errorsOf(publishAgreementSchema, { ...base, monthlyTarget: 2_000_000 })).toEqual({ monthlyTarget: "Per month must be at most 1000000." });
  });

  it("asks for a choice when an id is not one", () => {
    expect(errorsOf(setCampaignShareSchema, { campaignId: "5b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b", agencyOrgId: "nope", monthlyShare: 1 })).toEqual({ agencyOrgId: "Choose an option for agency." });
    expect(errorsOf(createPartnerAgencySchema, { supplierId: "", name: "X" })).toEqual({ supplierId: "Choose an option for coordinator." });
  });

  it("keeps the first sentence for a field", () => {
    expect(errorsOf(createSupplierSchema, { name: 5, extra: true })).toMatchObject({ name: expect.any(String) });
  });
});

describe("issueSentence", () => {
  it("passes a rule message through with the label in front", () => {
    expect(issueSentence("Time zone", { code: "custom", path: ["timeZone"], message: "must be an IANA time zone such as Europe/London" })).toBe("Time zone must be an IANA time zone such as Europe/London.");
  });

  it("falls back to a calm sentence for an issue it does not know", () => {
    expect(issueSentence("Note", { code: "unrecognized_keys", path: [], message: "Unrecognized key" })).toBe("Note is not valid.");
  });
});
