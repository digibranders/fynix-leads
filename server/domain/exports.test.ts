import { describe, expect, it } from "vitest";
import {
  generateAgencyLeadsCsv,
  generateClientLeadsCsv,
  generateFynixLeadsCsv,
  generateMeetingsCsv,
  toCsv,
} from "./exports";

describe("exports domain service", () => {
  describe("toCsv RFC 4180 formatting", () => {
    it("formats simple tabular data with CRLF delimiters", () => {
      const headers = ["Name", "Role", "Active"];
      const rows = [
        ["Alice Smith", "Engineer", true],
        ["Bob Jones", "Manager", false],
      ];

      const csv = toCsv(headers, rows);
      expect(csv).toBe("Name,Role,Active\r\nAlice Smith,Engineer,true\r\nBob Jones,Manager,false\r\n");
    });

    it("turns text that starts like a formula into plain text, and leaves numbers alone", () => {
      const csv = toCsv(["Name", "Notes", "Count"], [['=HYPERLINK("http://x")', "+44 7700 900123", -3], ["-1+1", "@SUM(A1)", 5], ["Plain", "a-b", 0]]);
      expect(csv).toBe(
        "Name,Notes,Count\r\n\"'=HYPERLINK(\"\"http://x\"\")\",'+44 7700 900123,-3\r\n'-1+1,'@SUM(A1),5\r\nPlain,a-b,0\r\n",
      );
    });

    it("escapes fields containing commas", () => {
      const headers = ["Company", "Location"];
      const rows = [["Acme, Inc.", "London, UK"]];

      const csv = toCsv(headers, rows);
      expect(csv).toBe('Company,Location\r\n"Acme, Inc.","London, UK"\r\n');
    });

    it("escapes fields containing double quotes", () => {
      const headers = ["Quote"];
      const rows = [['He said "Hello"']];

      const csv = toCsv(headers, rows);
      expect(csv).toBe('Quote\r\n"He said ""Hello"""\r\n');
    });

    it("escapes fields containing line breaks", () => {
      const headers = ["Notes"];
      const rows = [["Line 1\nLine 2\r\nLine 3"]];

      const csv = toCsv(headers, rows);
      expect(csv).toBe('Notes\r\n"Line 1\nLine 2\r\nLine 3"\r\n');
    });

    it("converts null and undefined values to empty strings", () => {
      const headers = ["Col1", "Col2", "Col3"];
      const rows = [["val1", null, undefined]];

      const csv = toCsv(headers, rows);
      expect(csv).toBe("Col1,Col2,Col3\r\nval1,,\r\n");
    });
  });

  describe("generateClientLeadsCsv zero-leakage guarantee", () => {
    it("never includes supply-side agency or coordinator identifiers", () => {
      const testLead = {
        publicRef: "LD-3W4K",
        prospectName: "Alex Vance",
        prospectTitle: "VP Engineering",
        prospectCompany: "Black Mesa",
        prospectDomain: "blackmesa.gov",
        prospectLinkedinUrl: "https://linkedin.com/in/alexvance",
        prospectEmail: "alex@blackmesa.gov",
        prospectPhone: "+1555123456",
        prospectNotes: "Ready for POC",
        bantBudget: "Budget approved",
        bantAuthority: "Direct sign-off",
        bantNeed: "Data migration",
        bantTimeline: "Q1",
        stage: "delivered",
        scheduledMeetingTime: new Date("2026-12-05T14:00:00Z"),
        submittedAt: new Date("2026-12-01T10:00:00Z"),
        // Sensitive supply-side identifiers that MUST NOT leak:
        agencyName: "Secret Agency Partner Ltd",
        supplierName: "Secret Coordinator Apex Corp",
        sourceOrgId: "secret-agency-uuid-9999",
        submittedByUserId: "secret-user-uuid-8888",
        aliasIdentityId: "secret-alias-uuid-7777",
      };

      const csv = generateClientLeadsCsv([testLead]);

      // Verify legitimate client data is present
      expect(csv).toContain("LD-3W4K");
      expect(csv).toContain("Alex Vance");
      expect(csv).toContain("Black Mesa");
      expect(csv).toContain("alex@blackmesa.gov");

      // Verify zero supply-side leakage
      expect(csv).not.toContain("Secret Agency Partner Ltd");
      expect(csv).not.toContain("Secret Coordinator Apex Corp");
      expect(csv).not.toContain("secret-agency-uuid-9999");
      expect(csv).not.toContain("secret-user-uuid-8888");
      expect(csv).not.toContain("secret-alias-uuid-7777");
      expect(csv).not.toContain("sourceOrgId");
      expect(csv).not.toContain("submittedByUserId");
      expect(csv).not.toContain("aliasIdentityId");
      expect(csv).not.toContain("agencyName");
      expect(csv).not.toContain("supplierName");
    });
  });

  describe("generateAgencyLeadsCsv zero-leakage guarantee", () => {
    it("never includes client person direct contact emails or phone numbers", () => {
      const testLead = {
        publicRef: "LD-9P2M",
        campaignId: "c-1234",
        prospectName: "Gordon Freeman",
        prospectTitle: "Research Lead",
        prospectCompany: "Black Mesa",
        prospectDomain: "blackmesa.gov",
        prospectLinkedinUrl: "https://linkedin.com/in/gordonfreeman",
        prospectEmail: "gordon@blackmesa.gov",
        prospectPhone: "+1555987654",
        stage: "scheduled",
        overShare: false,
        duplicateOverride: false,
        scheduledMeetingTime: new Date("2026-12-08T10:00:00Z"),
        submittedAt: new Date("2026-12-02T11:00:00Z"),
        // Sensitive client staff contact info that MUST NOT leak:
        clientEmail: "internal-client-staff@clientcorp.com",
        clientPhone: "+447999888777",
        hostEmail: "internal-host@clientcorp.com",
        hostPhone: "+447111222333",
        clientContactEmail: "contact@clientcorp.com",
        clientContactPhone: "+447000111222",
      };

      const csv = generateAgencyLeadsCsv([testLead]);

      // Verify legitimate agency view data is present
      expect(csv).toContain("LD-9P2M");
      expect(csv).toContain("Gordon Freeman");
      expect(csv).toContain("scheduled");

      // Verify zero client staff PII leakage
      expect(csv).not.toContain("internal-client-staff@clientcorp.com");
      expect(csv).not.toContain("+447999888777");
      expect(csv).not.toContain("internal-host@clientcorp.com");
      expect(csv).not.toContain("+447111222333");
      expect(csv).not.toContain("contact@clientcorp.com");
      expect(csv).not.toContain("+447000111222");
      expect(csv).not.toContain("clientEmail");
      expect(csv).not.toContain("hostEmail");
    });
  });

  describe("generateFynixLeadsCsv", () => {
    it("exports full lead overview for Fynix operations", () => {
      const testLead = {
        publicRef: "LD-7K1R",
        campaignName: "Enterprise Cloud Outreach",
        clientName: "Kestrel Cyber",
        prospectName: "Eli Vance",
        prospectTitle: "Chief Scientist",
        prospectCompany: "Black Mesa",
        prospectDomain: "blackmesa.gov",
        prospectEmail: "eli@blackmesa.gov",
        prospectPhone: "+1555333444",
        stage: "delivered",
        overShare: false,
        duplicateOverride: true,
        scheduledMeetingTime: new Date("2026-12-06T15:00:00Z"),
        submittedAt: new Date("2026-12-01T09:00:00Z"),
      };

      const csv = generateFynixLeadsCsv([testLead]);
      expect(csv).toContain("LD-7K1R");
      expect(csv).toContain("Enterprise Cloud Outreach");
      expect(csv).toContain("Kestrel Cyber");
      expect(csv.split("\r\n")[0]).toContain("Campaign,Client,Prospect Name");
      expect(csv).not.toContain("Client Brand");
      expect(csv).toContain("Eli Vance");
      expect(csv).toContain("delivered");
    });
  });

  describe("generateMeetingsCsv", () => {
    const meeting = { publicRef: "MTG-2K4M", leadRef: "LD-3K7M", prospectName: "=cmd|' /C calc'!A0", prospectCompany: "Nordvik, Cold Chain", campaignName: "UK finance", clientName: "Kestrel Ledger", scheduledStartTime: new Date("2026-12-01T10:00:00Z"), durationMinutes: 30, outcome: "held", recordedByRole: "coordinator", contestedByRole: null } as const;

    it("writes one row per meeting with the side that recorded it, and turns a formula into text", () => {
      const csv = generateMeetingsCsv([meeting]);
      expect(csv.split("\r\n")[0]).toBe("Meeting,Lead,Prospect,Company,Campaign,Start,Minutes,Outcome,Recorded by,Contested by");
      expect(csv).toContain("'=cmd|");
      expect(csv).toContain('"Nordvik, Cold Chain"');
      expect(csv).toContain("2026-12-01T10:00:00.000Z,30,held,coordinator,");
      expect(csv).not.toContain("Kestrel Ledger");
    });

    it("adds the client's name for Fynix and for an agency, never for a client", () => {
      const csv = generateMeetingsCsv([meeting], { withClient: true });
      expect(csv.split("\r\n")[0]).toContain("Campaign,Client,Start");
      expect(csv).toContain("Kestrel Ledger");
    });
  });
});
