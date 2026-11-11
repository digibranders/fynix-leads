import { describe, expect, it } from "vitest";
import { SAMPLE_LEADS, SAMPLE_REPS } from "@/lib/sample/data";
import { toAgencyView, type AgencyLead } from "./agency-view";

describe("toAgencyView", () => {
  const views = SAMPLE_LEADS.map(toAgencyView);
  const json = JSON.stringify(views);

  it("carries none of the client rep names and no repName key", () => {
    // Whole words: "Priya" must not trip on the prospect Priyanka Venkataraman.
    for (const word of ["Imogen", "Daniel", "Priya", "Okafor", "Raman", "Price"]) expect(json).not.toMatch(new RegExp(`\\b${word}\\b`));
    for (const rep of SAMPLE_REPS) expect(json).not.toContain(rep);
    expect(json).not.toContain("repName");
  });

  it("carries no email, phone, link or thread text", () => {
    expect(json).not.toMatch(/@|https?:\/\/|\+\d/);
    expect(json).not.toContain('"thread"');
    expect(json).not.toContain('"activity"');
  });

  it("keeps the fields the table needs", () => {
    const source = SAMPLE_LEADS.find((l) => l.ref === "LD-8L4T")!;
    const view = toAgencyView(source);
    expect(view.ref).toBe("LD-8L4T");
    expect(view.approval).toBe("rejected");
    expect(view.prospect).toEqual({
      name: source.prospect.name,
      title: source.prospect.title,
      company: source.prospect.company,
      companyDomain: source.prospect.companyDomain,
    });
    expect(view.meetings).toEqual([
      { id: "MT-1012", status: "prospect_declined", startsAt: source.meetings[0].startsAt, durationMinutes: 30 },
    ]);
    expect(view.decision).toEqual(source.decision);
  });

  it("keeps the replacement link", () => {
    expect(toAgencyView(SAMPLE_LEADS.find((l) => l.ref === "LD-9F1K")!).replacesRef).toBe("LD-3H8Q");
  });

  it("reports who spoke last in the thread, or null without a thread", () => {
    const side = (ref: string) => toAgencyView(SAMPLE_LEADS.find((l) => l.ref === ref)!).lastMessageSide;
    expect(side("LD-5N7W")).toBe("client");
    expect(side("LD-4K9P")).toBe("fynix");
    expect(side("LD-5T6C")).toBeNull();
  });

  it("has no repName in its type", () => {
    const meeting: AgencyLead["meetings"][number] = views[0].meetings[0];
    // @ts-expect-error repName is not part of the agency shape
    void meeting.repName;
    expect(meeting).toBeDefined();
  });
});
