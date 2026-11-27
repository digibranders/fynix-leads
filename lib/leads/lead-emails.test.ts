import { describe, expect, it } from "vitest";
import { parseLaunchContent, isProspectTemplate } from "@/lib/email/launch-templates";
import { campaignEmailDeliveries, leadEmailDeliveries, type LeadEmailContext, type LeadEmailEvent } from "./lead-emails";

const MEETING = { ref: "MTG-3F7K", startsAt: new Date("2026-12-08T14:30:00.000Z"), durationMinutes: 30, meetUrl: "https://meet.google.com/abc-defg-hij", icsSequence: 0, outcome: "scheduled" } as const;
const CONTEXT: LeadEmailContext = { ref: "LD-4K7M", company: "Nordvik Cold Chain", timeZone: "Europe/London", prospectReady: true, meeting: MEETING };
const NO_MEETING: LeadEmailContext = { ...CONTEXT, meeting: null };
const CANCELLED: LeadEmailContext = { ...CONTEXT, meeting: { ...MEETING, outcome: "cancelled", icsSequence: 1 } };
const NOTE = "Not a fit, reach me on marta@nordvik-cold.example or +44 7911 123456.";

const shape = (event: LeadEmailEvent, context = CONTEXT) => leadEmailDeliveries(event, context).map((delivery) => `${delivery.template}:${delivery.audience.join("+")}`);

describe("who gets which email", () => {
  it("a submitted lead: the client is asked for a time, the coordinator (when a partner agency sent it) and Fynix are told", () => {
    expect(shape({ type: "lead_submitted" })).toEqual(["lead_waiting:client", "lead_submitted_info:partner_coordinator+fynix"]);
  });

  it("proposed other times: the supply side and Fynix", () => {
    expect(shape({ type: "times_proposed" })).toEqual(["times_proposed_info:source+coordinator+fynix"]);
  });

  it("a time picked: the prospect letter, and the meeting email to the client contacts who asked for it and the supply side and Fynix", () => {
    expect(shape({ type: "meeting_scheduled" })).toEqual(["prospect_confirmed:prospect", "meeting_booked:client_meeting+source+coordinator+fynix"]);
    expect(shape({ type: "meeting_postponed" })).toEqual(["prospect_moved:prospect", "meeting_moved:client_meeting+source+coordinator+fynix"]);
  });

  it("no prospect letter when prospect email is not ready for the lead", () => {
    expect(shape({ type: "meeting_scheduled" }, { ...CONTEXT, prospectReady: false })).toEqual(["meeting_booked:client_meeting+source+coordinator+fynix"]);
  });

  it("a rejection before the meeting: the note goes to the supply side only, labelled Client, with its contact details taken out; the prospect hears only if a time was booked", () => {
    const event: LeadEmailEvent = { type: "rejected_before_meeting", by: "client", note: NOTE };
    expect(shape(event, CANCELLED)).toEqual(["prospect_cancelled:prospect", "meeting_cancelled:source+coordinator", "meeting_cancelled:client_meeting+fynix"]);
    expect(shape(event, NO_MEETING)).toEqual(["meeting_cancelled:source+coordinator", "meeting_cancelled:client_meeting+fynix"]);
    const [, toSupply, toClient] = leadEmailDeliveries(event, CANCELLED);
    expect(toSupply?.params.noteFrom).toBe("Client");
    expect(toSupply?.params.note).not.toMatch(/@|7911/);
    expect(toClient?.params.note).toBeUndefined();
    expect(leadEmailDeliveries({ ...event, by: "fynix" }, CANCELLED)[1]?.params.noteFrom).toBe("Fynix");
  });

  it("withdrawing or closing a lead cancels the meeting for everyone only when one was booked", () => {
    expect(shape({ type: "lead_withdrawn", note: "x" }, CANCELLED)).toEqual(["prospect_cancelled:prospect", "meeting_cancelled:source+coordinator", "meeting_cancelled:client_meeting+fynix"]);
    expect(shape({ type: "lead_lost", note: "x" }, NO_MEETING)).toEqual([]);
  });

  it("the outcome: the client is asked to answer, the others are told; a no-show closes the story with no question", () => {
    expect(shape({ type: "outcome_recorded", outcome: "held", by: "agency" })).toEqual(["outcome_held_client:client", "outcome_held_info:source+coordinator+fynix"]);
    expect(shape({ type: "outcome_recorded", outcome: "client_no_show", by: "agency" })).toEqual(["no_show_info:source+coordinator+fynix", "client_no_show_client:client"]);
    expect(shape({ type: "outcome_recorded", outcome: "prospect_no_show", by: "client" })).toEqual(["no_show_info:source+coordinator+fynix"]);
  });

  it("the decision: accepted, rejected (with the note), accepted after 48 hours, and a rejection changed by Fynix", () => {
    expect(shape({ type: "lead_accepted", by: "client", note: "n" })).toEqual(["lead_accepted_info:source+coordinator+fynix"]);
    expect(shape({ type: "lead_rejected", by: "client", note: "n" })).toEqual(["lead_rejected_info:source+coordinator+fynix"]);
    expect(leadEmailDeliveries({ type: "lead_rejected", by: "client", note: NOTE }, CONTEXT)[0]?.params).toMatchObject({ noteFrom: "Client" });
    expect(shape({ type: "lead_auto_accepted" })).toEqual(["lead_auto_accepted_info:source+coordinator+fynix", "lead_auto_accepted_client:client"]);
    expect(shape({ type: "rejection_overturned", note: "n" })).toEqual(["rejection_overturned_info:source+coordinator", "rejection_overturned_client:client"]);
  });

  it("a rejection Fynix changed: the client reads Fynix's note too, with contact details taken out", () => {
    const [, toClient] = leadEmailDeliveries({ type: "rejection_overturned", note: NOTE }, CONTEXT);
    expect(toClient?.params.noteFrom).toBe("Fynix");
    expect(toClient?.params.note).toContain("Not a fit");
    expect(toClient?.params.note).not.toMatch(/@|7911/);
  });

  it("the sweep's emails: the client's reminder with the hours left, the prospect's two reminders, and the nudge", () => {
    expect(leadEmailDeliveries({ type: "decision_reminder", hoursLeft: 36 }, CONTEXT)[0]).toMatchObject({ template: "decision_reminder", audience: ["client"], params: { hoursLeft: 36 } });
    expect(shape({ type: "prospect_reminder", kind: "24h" })).toEqual(["prospect_reminder_24h:prospect"]);
    expect(shape({ type: "prospect_reminder", kind: "1h" })).toEqual(["prospect_reminder_1h:prospect"]);
    expect(shape({ type: "outcome_nudge" })).toEqual(["outcome_nudge:source+coordinator+fynix"]);
  });

  it("no reminder for a meeting that is no longer scheduled", () => {
    expect(shape({ type: "prospect_reminder", kind: "1h" }, CANCELLED)).toEqual([]);
  });

  it("a proposal of new times goes to the side that must pick, and to Fynix", () => {
    expect(shape({ type: "postponement_proposed", by: "client" })).toEqual(["postponement_proposed_info:source+coordinator+fynix"]);
    expect(shape({ type: "postponement_proposed", by: "supply" })).toEqual(["postponement_proposed_info:client+fynix"]);
    expect(leadEmailDeliveries({ type: "postponement_proposed", by: "supply" }, CONTEXT)[0]?.params.proposedBy).toBe("supply");
  });

  it("a contested outcome and Fynix's decision go to all four sides, the note labelled by the side that wrote it", () => {
    expect(shape({ type: "outcome_contested", by: "agency", note: "n" })).toEqual(["outcome_contested_info:client+source+coordinator+fynix"]);
    const [contested] = leadEmailDeliveries({ type: "outcome_contested", by: "coordinator", note: NOTE }, CONTEXT);
    expect(contested?.params.noteFrom).toBe("Coordinator");
    expect(contested?.params.note).not.toMatch(/@|7911/);
    expect(shape({ type: "contest_decided", outcome: "client_no_show", note: "n" })).toEqual(["contest_decided_info:client+source+coordinator+fynix"]);
    expect(leadEmailDeliveries({ type: "contest_decided", outcome: "held", note: "n" }, CONTEXT)[0]?.params).toMatchObject({ decided: "held", noteFrom: "Fynix" });
  });

  it("a target that is met goes to the client, the coordinator and Fynix; an agency's share to that agency alone", () => {
    const month = { type: "target_met", scope: "campaign_month", campaignName: "UK freight", period: "November 2026", reached: 12, target: 12 } as const;
    expect(shape(month)).toEqual(["target_met_info:client+coordinator+fynix"]);
    expect(leadEmailDeliveries(month, CONTEXT)[0]?.params).toMatchObject({ scope: "month", campaignName: "UK freight", period: "November 2026", reached: 12, target: 12 });
    expect(shape({ ...month, scope: "campaign_total" })).toEqual(["target_met_info:client+coordinator+fynix"]);
    expect(leadEmailDeliveries({ ...month, scope: "campaign_total" }, CONTEXT)[0]?.params.scope).toBe("total");
    expect(shape({ ...month, scope: "agency_share" })).toEqual(["share_met_info:source"]);
  });

  it("a lead beyond its sender's share goes to Fynix alone", () => {
    expect(shape({ type: "lead_over_share" })).toEqual(["over_share_info:fynix"]);
  });

  it("leads still waiting for a time: the client once a day, Fynix as one summary", () => {
    expect(shape({ type: "leads_waiting", waiting: 3 })).toEqual(["leads_waiting_daily:client"]);
    expect(leadEmailDeliveries({ type: "leads_waiting", waiting: 3 }, CONTEXT)[0]?.params.waiting).toBe(3);
    const summary = { type: "leads_waiting_summary", clients: [{ name: "Kestrel Logistics", waiting: 3 }] } as const;
    expect(shape(summary)).toEqual(["leads_waiting_summary:fynix"]);
    expect(leadEmailDeliveries(summary, CONTEXT)[0]?.params.clients).toEqual([{ name: "Kestrel Logistics", waiting: 3 }]);
  });

  it("a new agreement version goes to the managers of both sides; a campaign update goes to the side it concerns; closing and acceptance send none", () => {
    const campaign = { campaignName: "UK freight" };
    expect(campaignEmailDeliveries({ type: "agreement_published", version: 3 }, campaign)).toEqual([
      { template: "agreement_published_info", audience: ["client_managers", "coordinator_managers"], params: { campaignName: "UK freight", version: 3 } },
    ]);
    expect(campaignEmailDeliveries({ type: "campaign_active" }, campaign)).toEqual([
      { template: "campaign_update_info", audience: ["client_managers", "coordinator_managers"], params: { campaignName: "UK freight", change: "active" } },
    ]);
    expect(campaignEmailDeliveries({ type: "campaign_assigned" }, campaign)).toEqual([
      { template: "campaign_update_info", audience: ["coordinator_managers"], params: { campaignName: "UK freight", change: "assigned" } },
    ]);
    expect(campaignEmailDeliveries({ type: "campaign_shared", agencyOrgId: "a1" }, campaign)).toEqual([
      { template: "campaign_update_info", audience: ["agency_managers:a1"], params: { campaignName: "UK freight", change: "shared" } },
    ]);
    expect(campaignEmailDeliveries({ type: "campaign_unshared", agencyOrgId: "a1" }, campaign)[0]?.params.change).toBe("unshared");
    expect(campaignEmailDeliveries({ type: "campaign_closed" }, campaign)).toEqual([]);
    expect(campaignEmailDeliveries({ type: "agreement_accepted", side: "client", version: 1 }, campaign)).toEqual([]);
  });

  it("a request to review a rejection goes to Fynix alone", () => {
    expect(shape({ type: "review_requested" })).toEqual(["review_requested_info:fynix"]);
  });

  it("every delivery builds content its own template accepts, and a prospect letter goes to the prospect alone", () => {
    const events: LeadEmailEvent[] = [
      { type: "lead_submitted" },
      { type: "times_proposed" },
      { type: "meeting_scheduled" },
      { type: "meeting_postponed" },
      { type: "rejected_before_meeting", by: "client", note: NOTE },
      { type: "outcome_recorded", outcome: "held", by: "client" },
      { type: "outcome_recorded", outcome: "prospect_no_show", by: "client" },
      { type: "outcome_recorded", outcome: "client_no_show", by: "agency" },
      { type: "postponement_proposed", by: "client" },
      { type: "postponement_proposed", by: "supply" },
      { type: "outcome_contested", by: "client", note: NOTE },
      { type: "contest_decided", outcome: "held", note: "n" },
      { type: "review_requested" },
      { type: "lead_over_share" },
      { type: "target_met", scope: "campaign_month", campaignName: "UK freight", period: "November 2026", reached: 12, target: 12 },
      { type: "target_met", scope: "campaign_total", campaignName: "UK freight", period: "November 2026", reached: 72, target: 72 },
      { type: "target_met", scope: "agency_share", campaignName: "UK freight", period: "November 2026", reached: 5, target: 5 },
      { type: "leads_waiting", waiting: 2 },
      { type: "leads_waiting_summary", clients: [{ name: "Kestrel Logistics", waiting: 2 }] },
      { type: "lead_accepted", by: "fynix", note: "n" },
      { type: "lead_rejected", by: "fynix", note: "n" },
      { type: "rejection_overturned", note: "n" },
      { type: "lead_auto_accepted" },
      { type: "decision_reminder", hoursLeft: 12 },
      { type: "prospect_reminder", kind: "24h" },
      { type: "outcome_nudge" },
    ];
    for (const event of events) {
      for (const delivery of leadEmailDeliveries(event, CANCELLED.meeting === null ? CONTEXT : { ...CONTEXT, meeting: { ...MEETING, outcome: event.type === "rejected_before_meeting" ? "cancelled" : "scheduled" } })) {
        // The database adds the prospect letter's own fields; the tests give them so the whole content can be read back.
        const extra = isProspectTemplate(delivery.template) ? { prospectName: "Marta", clientBrand: "Kestrel", privacyUrl: "https://k.example/p", signerName: "Lena", signerTitle: "BD" } : {};
        expect(() => parseLaunchContent(delivery.template, { ...delivery.params, ...extra }), delivery.template).not.toThrow();
        if (isProspectTemplate(delivery.template)) expect(delivery.audience).toEqual(["prospect"]);
        else expect(delivery.audience).not.toContain("prospect");
      }
    }
  });
});
