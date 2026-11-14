import { describe, expect, it } from "vitest";
import {
  extractDomainFromEmail,
  matchesExclusion,
  normaliseDomain,
  normaliseLinkedinUrl,
} from "./normalize";

describe("normaliseDomain", () => {
  it("strips protocols, www, paths and trailing query params", () => {
    expect(normaliseDomain("https://www.upwind.io/about")).toBe("upwind.io");
    expect(normaliseDomain("http://acme.org/")).toBe("acme.org");
    expect(normaliseDomain("WWW.EXAMPLE.COM?ref=123")).toBe("example.com");
    expect(normaliseDomain("sub.domain.co.uk/path/to/page")).toBe("sub.domain.co.uk");
  });
});

describe("extractDomainFromEmail", () => {
  it("extracts lowercase domain from email", () => {
    expect(extractDomainFromEmail("CISO@Company.example")).toBe("company.example");
    expect(extractDomainFromEmail("plain")).toBe("");
  });
});

describe("normaliseLinkedinUrl", () => {
  it("canonicalizes LinkedIn profile URLs", () => {
    expect(normaliseLinkedinUrl("https://www.linkedin.com/in/vijendra-ciso/")).toBe("linkedin.com/in/vijendra-ciso");
    expect(normaliseLinkedinUrl("http://linkedin.com/in/vijendra-ciso?trackingId=99")).toBe("linkedin.com/in/vijendra-ciso");
    expect(normaliseLinkedinUrl("LINKEDIN.COM/IN/user/")).toBe("linkedin.com/in/user");
  });
});

describe("matchesExclusion", () => {
  const prospect = {
    email: "vijendra@megacorp.com",
    domain: "megacorp.com",
    company: "MegaCorp International",
  };

  it("matches exact email exclusion", () => {
    expect(matchesExclusion({ kind: "email", value: "vijendra@megacorp.com" }, prospect)).toBe(true);
    expect(matchesExclusion({ kind: "email", value: "other@megacorp.com" }, prospect)).toBe(false);
  });

  it("matches domain exclusion by root or subdomain", () => {
    expect(matchesExclusion({ kind: "domain", value: "megacorp.com" }, prospect)).toBe(true);
    expect(matchesExclusion({ kind: "domain", value: "othercorp.com" }, prospect)).toBe(false);

    const subProspect = {
      email: "alex@uk.megacorp.com",
      domain: "uk.megacorp.com",
      company: "MegaCorp UK",
    };
    expect(matchesExclusion({ kind: "domain", value: "megacorp.com" }, subProspect)).toBe(true);
  });

  it("matches company name exclusion", () => {
    expect(matchesExclusion({ kind: "company", value: "MegaCorp" }, prospect)).toBe(true);
    expect(matchesExclusion({ kind: "company", value: "MegaCorp International" }, prospect)).toBe(true);
    expect(matchesExclusion({ kind: "company", value: "Competitor" }, prospect)).toBe(false);
  });
});
