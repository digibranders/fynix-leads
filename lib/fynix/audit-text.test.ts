import { describe, expect, it } from "vitest";
import { auditSentence } from "@/lib/fynix/audit-text";

describe("auditSentence", () => {
  it("names the known actions and reads an unknown one from its words", () => {
    expect(auditSentence("organisation.archive")).toBe("Archived");
    expect(auditSentence("campaign.close")).toBe("Campaign closed");
    expect(auditSentence("campaign_share.set")).toBe("Campaign share set");
  });
});
