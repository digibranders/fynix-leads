import { describe, expect, it } from "vitest";
import { NO_SLOT, leadIsReady, requiredTexts, type RequiredTexts } from "./submit-readiness";
import { submitLeadSchema } from "@/server/domain/inputs";
import type { QualificationCheck } from "@/lib/qualification-checks";

const texts: RequiredTexts = { prospectName: "Priya Nair", prospectTitle: "CFO", prospectCompany: "Harbour Freight", prospectDomain: "harbour.example", prospectEmail: "priya@harbour.example", prospectLinkedinUrl: "https://linkedin.com/in/priya" };
const slot = { time: "2026-12-03T10:00:00.000Z", invitees: 1 };
const CAMPAIGN = "11111111-1111-4111-8111-111111111111";
const PERSON = "22222222-2222-4222-8222-222222222222";
const criterion: QualificationCheck = { kind: "criteria", label: "A target market", expected: "UK", passed: true };
const question: QualificationCheck = { kind: "question", label: "How many vans?", expected: "20 to 250", passed: true, answer: "About 85" };

/** The same lead as the form would post it, so the server's own rule can be asked about it. */
const posted = (t: RequiredTexts, checks: readonly QualificationCheck[], campaignId = CAMPAIGN, time = slot.time) => ({
  campaignId,
  hostMemberId: PERSON,
  ...t,
  qualificationChecks: checks,
  proposedTimes: time === "" ? [] : [time],
  inviteeMemberIds: [PERSON],
});

describe("leadIsReady", () => {
  const ready = (over: Partial<Parameters<typeof leadIsReady>[0]> = {}) => leadIsReady({ campaignId: CAMPAIGN, texts, slot, checks: [criterion, question], ...over });

  it("is ready when everything is there", () => {
    expect(ready()).toBe(true);
  });

  it("is not ready without a campaign, a required field, a valid email, a time or someone to invite", () => {
    expect(ready({ campaignId: "" })).toBe(false);
    for (const name of Object.keys(texts) as (keyof RequiredTexts)[]) expect(ready({ texts: { ...texts, [name]: "  " } }), name).toBe(false);
    expect(ready({ texts: { ...texts, prospectEmail: "priya" } })).toBe(false);
    expect(ready({ slot: NO_SLOT })).toBe(false);
    expect(ready({ slot: { time: slot.time, invitees: 0 } })).toBe(false);
  });

  it("needs an answer for a question and a reason for a criterion that is not ticked, and nothing for one that is", () => {
    expect(ready({ checks: [{ ...question, answer: "" }] })).toBe(false);
    expect(ready({ checks: [{ ...criterion, passed: false }] })).toBe(false);
    expect(ready({ checks: [{ ...criterion, passed: false, answer: "They are in Spain" }] })).toBe(true);
    expect(ready({ checks: [{ ...question, passed: false }] })).toBe(true);
  });

  it("never says ready for a lead the server would refuse, in the cases a person can reach", () => {
    const cases: { readonly t: RequiredTexts; readonly checks: QualificationCheck[]; readonly campaign?: string; readonly time?: string }[] = [
      { t: texts, checks: [criterion, question] },
      { t: texts, checks: [{ ...question, answer: "" }] },
      { t: texts, checks: [{ ...criterion, passed: false }] },
      { t: texts, checks: [{ ...criterion, passed: false, answer: "Elsewhere" }] },
      { t: { ...texts, prospectName: "" }, checks: [] },
      { t: { ...texts, prospectEmail: "priya" }, checks: [] },
      { t: texts, checks: [], time: "" },
    ];
    for (const item of cases) {
      const isReady = leadIsReady({ campaignId: item.campaign ?? CAMPAIGN, texts: item.t, slot: item.time === "" ? NO_SLOT : slot, checks: item.checks });
      if (isReady) expect(submitLeadSchema.safeParse(posted(item.t, item.checks, item.campaign, item.time)).success, JSON.stringify(item.checks)).toBe(true);
    }
  });
});

describe("requiredTexts", () => {
  it("reads the six required fields by name and leaves the rest alone", () => {
    const form = { elements: [{ name: "prospectName", value: "Priya" }, { name: "prospectNotes", value: "x" }, { name: "prospectEmail", value: "p@h.example" }] };
    expect(requiredTexts(form)).toEqual({ prospectName: "Priya", prospectTitle: "", prospectCompany: "", prospectDomain: "", prospectEmail: "p@h.example", prospectLinkedinUrl: "" });
    expect(requiredTexts(null).prospectName).toBe("");
  });
});
