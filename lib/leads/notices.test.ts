import { describe, expect, it } from "vitest";
import { NOTICE_AUDIENCES, NOTICE_KINDS, campaignNotices, leadNotices, type CampaignNoticeEvent, type LeadNoticeEvent } from "./notices";

const LEAD_EVENTS: readonly LeadNoticeEvent[] = [
  { type: "lead_submitted" },
  { type: "times_proposed" },
  { type: "meeting_scheduled" },
  { type: "postponement_proposed", by: "client" },
  { type: "postponement_proposed", by: "supply" },
  { type: "meeting_postponed" },
  { type: "rejected_before_meeting", by: "client", note: "Not a fit for us" },
  { type: "rejected_before_meeting", by: "fynix", note: "The client cannot attend" },
  { type: "lead_withdrawn", note: "The prospect asked us to stop" },
  { type: "lead_lost", note: "Closed by Fynix" },
  { type: "outcome_recorded", outcome: "held", by: "agency" },
  { type: "outcome_recorded", outcome: "client_no_show", by: "coordinator" },
  { type: "outcome_recorded", outcome: "prospect_no_show", by: "client" },
  { type: "outcome_recorded", outcome: "held", by: "fynix" },
  { type: "outcome_contested", by: "client", note: "They did attend" },
  { type: "outcome_contested", by: "coordinator", note: "The client did not join" },
  { type: "contest_decided", outcome: "held", note: "Fynix checked the room record" },
  { type: "lead_accepted", by: "client", note: "A good fit" },
  { type: "lead_accepted", by: "fynix", note: "The client agreed by phone" },
  { type: "lead_rejected", by: "client", note: "Wrong industry" },
  { type: "lead_rejected", by: "fynix", note: "The client asked us to reject it" },
  { type: "rejection_overturned", note: "The prospect qualifies" },
  { type: "review_requested" },
];

const CAMPAIGN_EVENTS: readonly CampaignNoticeEvent[] = [{ type: "campaign_active" }, { type: "campaign_closed" }, { type: "agreement_published", version: 3 }];

const written = (deliveries: readonly { title: string; body: string }[]): string => deliveries.map((entry) => `${entry.title} ${entry.body}`).join(" ");

describe("the notice catalogue", () => {
  it("gives every lead event at least one delivery with a known kind and audience", () => {
    for (const event of LEAD_EVENTS) {
      const deliveries = leadNotices(event);
      expect(deliveries.length, event.type).toBeGreaterThan(0);
      for (const delivery of deliveries) {
        expect(NOTICE_KINDS, event.type).toContain(delivery.kind);
        expect(delivery.audience.length, event.type).toBeGreaterThan(0);
        for (const audience of delivery.audience) expect(NOTICE_AUDIENCES, event.type).toContain(audience);
        expect(delivery.title.length, event.type).toBeLessThanOrEqual(200);
        expect(delivery.body.length, event.type).toBeLessThanOrEqual(500);
      }
    }
    for (const event of CAMPAIGN_EVENTS) {
      for (const delivery of campaignNotices(event)) {
        expect(NOTICE_KINDS, event.type).toContain(delivery.kind);
        for (const audience of delivery.audience) expect(NOTICE_AUDIENCES, event.type).toContain(audience);
      }
    }
  });

  it("writes no dash, no exclamation mark, no email address and no word 'supplier' in any text", () => {
    const all = [...LEAD_EVENTS.map((event) => written(leadNotices(event))), ...CAMPAIGN_EVENTS.map((event) => written(campaignNotices(event)))];
    for (const entry of all) {
      expect(entry).not.toMatch(/[\u2013\u2014!@]/);
      expect(entry.toLowerCase()).not.toContain("supplier");
    }
  });

  it("tells the client too when Fynix changes its rejection to accepted, with Fynix's note", () => {
    const overturned = leadNotices({ type: "rejection_overturned", note: "The prospect qualifies" });
    expect(overturned).toHaveLength(1);
    expect(overturned[0]?.audience).toEqual(["client", "source", "coordinator"]);
    expect(overturned[0]?.body).toContain("Note from Fynix: The prospect qualifies");
  });

  it("takes contact details out of a note before it is stored", () => {
    const deliveries = leadNotices({ type: "lead_rejected", by: "client", note: "Call Marta on +44 7911 123456 or write to marta@nordvik.example" });
    for (const delivery of deliveries) {
      expect(delivery.body).not.toContain("marta@nordvik.example");
      expect(delivery.body).not.toContain("7911");
    }
  });

  it("keeps the client's note for the supply side and Fynix, as from the client, and never to the client's own colleagues", () => {
    const rejected = leadNotices({ type: "lead_rejected", by: "client", note: "Wrong industry" });
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.audience).toEqual(["source", "coordinator", "fynix"]);
    expect(rejected[0]?.body).toContain("Note from Client: Wrong industry");
  });

  it("asks the client to decide after a held meeting and tells the others, and tells everyone about a no-show", () => {
    const held = leadNotices({ type: "outcome_recorded", outcome: "held", by: "agency" });
    expect(held.map((entry) => [entry.kind, entry.audience])).toEqual([
      ["decision_needed", ["client"]],
      ["outcome_recorded", ["source", "coordinator", "fynix"]],
    ]);
    const noShow = leadNotices({ type: "outcome_recorded", outcome: "client_no_show", by: "agency" });
    expect(noShow).toHaveLength(1);
    expect(noShow[0]?.audience).toEqual(["client", "source", "coordinator", "fynix"]);
  });

  it("names a side and never a person or a company", () => {
    const contested = leadNotices({ type: "outcome_contested", by: "coordinator", note: "The client did not join" });
    expect(contested[0]?.body).toContain("Coordinator");
  });
});
