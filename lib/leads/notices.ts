import { relayText } from "@/lib/relay/relay-text";

/**
 * The notices in the app (phase 5, "Emails at launch" in the Meet note): for each lead or campaign event, who is told and what it says. A notice
 * is a row per person in `notification`. The text never holds a prospect's email or phone, a person's name, or the name of a company on the
 * other side: a note typed by a person is scrubbed of contact details first, and a side is named by its role ("the client", "the coordinator").
 * `{ref}` and `{company}` are filled in by the database function that writes the notice, from the lead it names.
 *
 * Pure: the database function that resolves the audience and checks the caller is `app_notify_lead` / `app_notify_campaign` (migration 0071).
 */

export { NOTICE_KINDS, type NoticeKind } from "./notice-kinds";
import type { NoticeKind } from "./notice-kinds";

/**
 * Who a delivery goes to, resolved by the database from the lead or campaign (every one means active people only, and never the person who acted):
 * `client` all the client's people, `client_managers` its managers, `source` the organisation that submitted the lead, `coordinator` the
 * campaign's coordinator, `partner_coordinator` the coordinator only when a partner agency submitted the lead, `coordinator_managers` its
 * managers, `shared_agencies` the agencies holding a share, `fynix` every Fynix person.
 */
export const NOTICE_AUDIENCES = ["client", "client_managers", "source", "coordinator", "partner_coordinator", "coordinator_managers", "shared_agencies", "fynix"] as const;
export type NoticeAudience = (typeof NOTICE_AUDIENCES)[number];

export type NoticeTarget = "lead" | "campaign" | "agreement";

export interface NoticeDelivery {
  readonly audience: readonly NoticeAudience[];
  readonly kind: NoticeKind;
  readonly title: string;
  readonly body: string;
  readonly target: NoticeTarget;
}

/** Which side recorded an outcome or contested one. A role, never a person. */
export type NoticeSide = "client" | "agency" | "coordinator" | "fynix";

export type LeadNoticeEvent =
  | { readonly type: "lead_submitted" }
  | { readonly type: "times_proposed" }
  | { readonly type: "meeting_scheduled" }
  | { readonly type: "postponement_proposed"; readonly by: "client" | "supply" }
  | { readonly type: "meeting_postponed" }
  | { readonly type: "rejected_before_meeting"; readonly by: "client" | "fynix"; readonly note: string }
  | { readonly type: "lead_withdrawn"; readonly note: string }
  | { readonly type: "lead_lost"; readonly note: string }
  | { readonly type: "outcome_recorded"; readonly outcome: "held" | "client_no_show" | "prospect_no_show"; readonly by: NoticeSide }
  | { readonly type: "outcome_contested"; readonly by: "client" | "agency" | "coordinator"; readonly note: string }
  | { readonly type: "contest_decided"; readonly outcome: "held" | "client_no_show" | "prospect_no_show"; readonly note: string }
  | { readonly type: "lead_accepted"; readonly by: "client" | "fynix"; readonly note: string }
  | { readonly type: "lead_rejected"; readonly by: "client" | "fynix"; readonly note: string }
  | { readonly type: "rejection_overturned"; readonly note: string }
  | { readonly type: "review_requested" };

export type CampaignNoticeEvent = { readonly type: "campaign_active" } | { readonly type: "campaign_closed" } | { readonly type: "agreement_published"; readonly version: number };

const SUPPLY_AND_FYNIX = ["source", "coordinator", "fynix"] as const;
const EVERYONE = ["client", "source", "coordinator", "fynix"] as const;
const SIDE_WORD: Record<NoticeSide, string> = { client: "the client", agency: "the agency", coordinator: "the coordinator", fynix: "Fynix" };
const SIDE_LABEL: Record<"client" | "agency" | "coordinator" | "fynix", string> = { client: "Client", agency: "Agency", coordinator: "Coordinator", fynix: "Fynix" };

/** A note typed by a person, with contact details taken out and cut to a notice's length. */
function noteOf(note: string): string {
  const clean = relayText(note).text;
  return clean.length > 280 ? `${clean.slice(0, 277)}...` : clean;
}

const lead = (audience: readonly NoticeAudience[], kind: NoticeKind, title: string, body: string): NoticeDelivery => ({ audience, kind, title, body, target: "lead" });

const OUTCOME_LINE: Record<"held" | "client_no_show" | "prospect_no_show", string> = {
  held: "The meeting was held.",
  client_no_show: "The client did not attend. It counts as one.",
  prospect_no_show: "The prospect did not attend. The lead is closed and counts as zero.",
};

/** What a lead event tells whom. Fynix gets a notice for every event; the person who acted is left out by the database, not here. */
export function leadNotices(event: LeadNoticeEvent): readonly NoticeDelivery[] {
  switch (event.type) {
    case "lead_submitted":
      return [lead(["client", "fynix", "partner_coordinator"], "lead_submitted", "Lead {ref} is waiting for a time", "A lead from {company} is ready. Pick one of the proposed times or propose others.")];
    case "times_proposed":
      return [lead(["source", "coordinator", "fynix"], "times_proposed", "The client proposed other times for {ref}", "The client could not use the times offered for {company}. Pick one of the new times.")];
    case "meeting_scheduled":
      return [lead(EVERYONE, "meeting_scheduled", "Meeting booked for {ref}", "A meeting time was picked for {company}.")];
    case "postponement_proposed":
      return event.by === "client"
        ? [lead(SUPPLY_AND_FYNIX, "times_proposed", "The client proposed new times for {ref}", "The client asks to move the meeting with {company}. Pick one of the new times.")]
        : [lead(["client", "fynix"], "times_proposed", "New times proposed for {ref}", "The meeting with {company} needs a new time. Pick one of the proposed times.")];
    case "meeting_postponed":
      return [lead(EVERYONE, "meeting_postponed", "Meeting moved for {ref}", "The meeting with {company} has a new time.")];
    case "rejected_before_meeting":
      return event.by === "client"
        ? [lead(SUPPLY_AND_FYNIX, "lead_rejected", "Lead {ref} was rejected before the meeting", `The meeting will not take place and the lead counts as zero. Note from Client: ${noteOf(event.note)}`)]
        : [lead(EVERYONE, "lead_rejected", "Lead {ref} was rejected before the meeting", `Fynix rejected this lead for the client. The meeting will not take place. Note from Fynix: ${noteOf(event.note)}`)];
    case "lead_withdrawn":
      return [lead(EVERYONE, "lead_withdrawn", "Lead {ref} was withdrawn", `It was withdrawn before the meeting and counts as zero. Note: ${noteOf(event.note)}`)];
    case "lead_lost":
      return [lead(EVERYONE, "lead_lost", "Lead {ref} was closed by Fynix", `The lead counts as zero. Note from Fynix: ${noteOf(event.note)}`)];
    case "outcome_recorded":
      return event.outcome === "held"
        ? [
            lead(["client"], "decision_needed", "Accept or reject lead {ref}", `The meeting with {company} was held. Accept or reject the lead. It is accepted automatically after 48 hours with no answer.`),
            lead(SUPPLY_AND_FYNIX, "outcome_recorded", "Outcome recorded for {ref}", `Recorded by ${SIDE_WORD[event.by]}. The meeting was held. The client now decides.`),
          ]
        : [lead(EVERYONE, "outcome_recorded", "Outcome recorded for {ref}", `Recorded by ${SIDE_WORD[event.by]}. ${OUTCOME_LINE[event.outcome]}`)];
    case "outcome_contested":
      return [lead(EVERYONE, "outcome_contested", "The outcome of {ref} is contested", `Note from ${SIDE_LABEL[event.by]}: ${noteOf(event.note)} Fynix decides.`)];
    case "contest_decided":
      return [lead(EVERYONE, "contest_decided", "Fynix decided the contest on {ref}", `${OUTCOME_LINE[event.outcome]} Note from Fynix: ${noteOf(event.note)}`)];
    case "lead_accepted":
      return event.by === "client"
        ? [lead(SUPPLY_AND_FYNIX, "lead_accepted", "Lead {ref} was accepted", `The lead counts as one. Note from Client: ${noteOf(event.note)}`)]
        : [lead(EVERYONE, "lead_accepted", "Lead {ref} was accepted", `Fynix accepted this lead for the client. It counts as one. Note from Fynix: ${noteOf(event.note)}`)];
    case "lead_rejected":
      return event.by === "client"
        ? [lead(SUPPLY_AND_FYNIX, "lead_rejected", "Lead {ref} was rejected", `The lead counts as zero. Note from Client: ${noteOf(event.note)}`)]
        : [lead(EVERYONE, "lead_rejected", "Lead {ref} was rejected", `Fynix rejected this lead for the client. It counts as zero. Note from Fynix: ${noteOf(event.note)}`)];
    case "rejection_overturned":
      // The client reads it too: the lead now counts toward its number (owner decision, 2026-11-25).
      return [lead(["client", "source", "coordinator"], "rejection_overturned", "The rejection of {ref} was changed to accepted", `Fynix changed it. The lead counts as one. Note from Fynix: ${noteOf(event.note)}`)];
    case "review_requested":
      return [lead(["fynix"], "review_requested", "A review of the rejection of {ref} was asked for", "The coordinator asks Fynix to look at this rejection again.")];
  }
}

const campaign = (audience: readonly NoticeAudience[], kind: NoticeKind, title: string, body: string, target: NoticeTarget): NoticeDelivery => ({ audience, kind, title, body, target });

/** What a campaign event tells whom. `{ref}` is the campaign's reference here. */
export function campaignNotices(event: CampaignNoticeEvent): readonly NoticeDelivery[] {
  switch (event.type) {
    case "campaign_active":
      return [campaign(["client", "coordinator", "shared_agencies", "fynix"], "campaign_active", "Campaign {ref} is active", "Leads can now be submitted for this campaign.", "campaign")];
    case "campaign_closed":
      return [campaign(["client", "coordinator", "shared_agencies", "fynix"], "campaign_closed", "Campaign {ref} is closed", "No new leads can be submitted. Leads already sent finish their course.", "campaign")];
    case "agreement_published":
      return [campaign(["client_managers", "coordinator_managers"], "agreement_published", "Agreement version {version} for {ref} needs your acceptance".replace("{version}", String(event.version)), "A new version of the agreement is published. The old one stays in force until both sides accept the new one.", "agreement")];
  }
}
