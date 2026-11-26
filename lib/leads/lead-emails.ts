import { formatMeetingTime, type LaunchParams, type LaunchTemplate } from "@/lib/email/launch-templates";
import { relayText } from "@/lib/relay/relay-text";
import type { CampaignNoticeEvent, LeadNoticeEvent } from "@/lib/leads/notices";

/**
 * Which emails each lead event sends, to whom (phase 6, the table "Emails at launch" in the Meet note). Pure: the database function that queues a message
 * resolves the audience words to people, leaves out the person who acted and adds what only it may read to a prospect letter.
 *
 * The audiences are the notice audiences of `lib/leads/notices.ts`, with two differences: `client_meeting` is the client's people who asked for meeting emails (every
 * meeting email goes to them and not to the other contacts), and `prospect` is the person the meeting is with.
 */
export type EmailAudience = "client" | "client_meeting" | "source" | "coordinator" | "partner_coordinator" | "fynix" | "prospect";

/** Events with no notice in the app: the sweep's. */
export type SystemEmailEvent =
  | { readonly type: "lead_auto_accepted" }
  | { readonly type: "decision_reminder"; readonly hoursLeft: number }
  | { readonly type: "prospect_reminder"; readonly kind: "24h" | "1h" }
  | { readonly type: "outcome_nudge" }
  /** A target the lead completed (`app_claim_target_notices`): the campaign's for a month, the campaign's in total, or the share of the agency that sent the lead. */
  | { readonly type: "target_met"; readonly scope: "campaign_month" | "campaign_total" | "agency_share"; readonly campaignName: string; readonly period: string; readonly reached: number; readonly target: number }
  /** The client's daily reminder, keyed on the lead that has waited longest for a time. */
  | { readonly type: "leads_waiting"; readonly waiting: number }
  /** Fynix's daily summary, keyed on the lead that has waited longest of all. */
  | { readonly type: "leads_waiting_summary"; readonly clients: readonly { readonly name: string; readonly waiting: number }[] };

export type LeadEmailEvent = LeadNoticeEvent | SystemEmailEvent;

/** What the database says about the lead and its latest meeting (`app_lead_email_context`). */
export interface LeadEmailContext {
  readonly ref: string;
  readonly company: string;
  readonly timeZone: string;
  readonly prospectReady: boolean;
  readonly meeting: {
    readonly ref: string;
    readonly startsAt: Date;
    readonly durationMinutes: number;
    readonly meetUrl: string | null;
    readonly icsSequence: number;
    readonly outcome: string;
  } | null;
}

export interface EmailDelivery {
  readonly template: LaunchTemplate;
  readonly audience: readonly EmailAudience[];
  readonly params: LaunchParams;
}

const SUPPLY_AND_FYNIX = ["source", "coordinator", "fynix"] as const;
const EVERYONE = ["client", "source", "coordinator", "fynix"] as const;
const SIDE_LABEL = { client: "Client", agency: "Agency", coordinator: "Coordinator" } as const;
const MEETING_PEOPLE = ["client_meeting", "source", "coordinator", "fynix"] as const;

/** A note typed by a person, with contact details taken out and cut to the length an email holds. */
function noteOf(note: string): string {
  const clean = relayText(note).text;
  return clean.length > 500 ? `${clean.slice(0, 497)}...` : clean;
}

function meetingParams(context: LeadEmailContext): Pick<LaunchParams, "when" | "meetUrl" | "calendar"> | null {
  const meeting = context.meeting;
  if (meeting === null) return null;
  return {
    when: formatMeetingTime(meeting.startsAt, context.timeZone),
    meetUrl: meeting.meetUrl,
    calendar: {
      meetingRef: meeting.ref,
      startsAt: meeting.startsAt.toISOString(),
      endsAt: new Date(meeting.startsAt.getTime() + meeting.durationMinutes * 60_000).toISOString(),
      sequence: meeting.icsSequence,
    },
  };
}

export function leadEmailDeliveries(event: LeadEmailEvent, context: LeadEmailContext): readonly EmailDelivery[] {
  const base: LaunchParams = { ref: context.ref, company: context.company };
  const meeting = meetingParams(context);
  const prospect = (template: LaunchTemplate, extra: LaunchParams): readonly EmailDelivery[] => (context.prospectReady ? [{ template, audience: ["prospect"], params: extra }] : []);
  switch (event.type) {
    case "lead_submitted":
      return [
        { template: "lead_waiting", audience: ["client"], params: base },
        { template: "lead_submitted_info", audience: ["partner_coordinator", "fynix"], params: base },
      ];
    case "times_proposed":
      return [{ template: "times_proposed_info", audience: SUPPLY_AND_FYNIX, params: base }];
    case "meeting_scheduled":
    case "meeting_postponed": {
      if (meeting === null) return [];
      const moved = event.type === "meeting_postponed";
      return [
        ...prospect(moved ? "prospect_moved" : "prospect_confirmed", meeting),
        { template: moved ? "meeting_moved" : "meeting_booked", audience: MEETING_PEOPLE, params: { ...base, ...meeting } },
      ];
    }
    // The invitation email and the email that tells the agency a new time is needed are not built yet: people read both in the app.
    case "reschedule_needed":
    case "meeting_invited":
      return [];
    case "rejected_before_meeting":
    case "lead_withdrawn":
    case "lead_lost": {
      const reason = event.type === "rejected_before_meeting" ? "rejected" : event.type === "lead_withdrawn" ? "withdrawn" : "closed";
      const cancelled = context.meeting !== null && context.meeting.outcome === "cancelled" ? meeting : null;
      // A lead that never had a time picked has no meeting to cancel and no prospect who was told of one. A rejection is still news to the people who work the lead.
      if (cancelled === null && event.type !== "rejected_before_meeting") return [];
      const calendar = cancelled === null ? {} : { calendar: cancelled.calendar, meetUrl: cancelled.meetUrl };
      const from = event.type === "rejected_before_meeting" && event.by === "fynix" ? "Fynix" : "Client";
      return [
        ...(cancelled === null ? [] : prospect("prospect_cancelled", { calendar: cancelled.calendar })),
        // The note goes to the supply side, labelled "Client" (or "Fynix"), as in the notice. The client's other contacts and Fynix are told without it.
        { template: "meeting_cancelled", audience: ["source", "coordinator"], params: { ...base, reason, ...calendar, ...(event.type === "rejected_before_meeting" ? { note: noteOf(event.note), noteFrom: from } : {}) } },
        { template: "meeting_cancelled", audience: ["client_meeting", "fynix"], params: { ...base, reason, ...calendar } },
      ];
    }
    case "outcome_recorded":
      return event.outcome === "held"
        ? [
            { template: "outcome_held_client", audience: ["client"], params: base },
            { template: "outcome_held_info", audience: SUPPLY_AND_FYNIX, params: base },
          ]
        : [
            { template: "no_show_info", audience: SUPPLY_AND_FYNIX, params: { ...base, outcome: event.outcome } },
            // A client no-show counts as one against the client, so its people are told and can contest it.
            ...(event.outcome === "client_no_show" ? [{ template: "client_no_show_client", audience: ["client"], params: base } as const] : []),
          ];
    case "lead_accepted":
      return [{ template: "lead_accepted_info", audience: SUPPLY_AND_FYNIX, params: base }];
    case "lead_rejected":
      return [{ template: "lead_rejected_info", audience: SUPPLY_AND_FYNIX, params: { ...base, note: noteOf(event.note), noteFrom: event.by === "fynix" ? "Fynix" : "Client" } }];
    case "rejection_overturned":
      return [
        { template: "rejection_overturned_info", audience: ["source", "coordinator"], params: { ...base, note: noteOf(event.note), noteFrom: "Fynix" } },
        { template: "rejection_overturned_client", audience: ["client"], params: { ...base, note: noteOf(event.note), noteFrom: "Fynix" } },
      ];
    case "lead_auto_accepted":
      return [
        { template: "lead_auto_accepted_info", audience: SUPPLY_AND_FYNIX, params: base },
        { template: "lead_auto_accepted_client", audience: ["client"], params: base },
      ];
    case "postponement_proposed":
      // The side that did not propose is the one that picks, as on the notice.
      return [{ template: "postponement_proposed_info", audience: event.by === "client" ? SUPPLY_AND_FYNIX : ["client", "fynix"], params: { ...base, proposedBy: event.by } }];
    case "outcome_contested":
      return [{ template: "outcome_contested_info", audience: EVERYONE, params: { ...base, note: noteOf(event.note), noteFrom: SIDE_LABEL[event.by] } }];
    case "contest_decided":
      return [{ template: "contest_decided_info", audience: EVERYONE, params: { ...base, decided: event.outcome, note: noteOf(event.note), noteFrom: "Fynix" } }];
    case "review_requested":
      return [{ template: "review_requested_info", audience: ["fynix"], params: base }];
    case "lead_over_share":
      return [{ template: "over_share_info", audience: ["fynix"], params: base }];
    case "target_met":
      // An agency hears of its own share and never of the campaign's target; the campaign's target goes to the client, the coordinator and Fynix.
      return event.scope === "agency_share"
        ? [{ template: "share_met_info", audience: ["source"], params: { ...base, campaignName: event.campaignName, period: event.period, reached: event.reached, target: event.target } }]
        : [{ template: "target_met_info", audience: ["client", "coordinator", "fynix"], params: { ...base, campaignName: event.campaignName, scope: event.scope === "campaign_month" ? "month" : "total", period: event.period, reached: event.reached, target: event.target } }];
    case "leads_waiting":
      return [{ template: "leads_waiting_daily", audience: ["client"], params: { ...base, waiting: event.waiting } }];
    case "leads_waiting_summary":
      return [{ template: "leads_waiting_summary", audience: ["fynix"], params: { ...base, clients: event.clients.map((entry) => ({ name: entry.name, waiting: entry.waiting })) } }];
    case "decision_reminder":
      return [{ template: "decision_reminder", audience: ["client"], params: { ...base, hoursLeft: event.hoursLeft } }];
    case "prospect_reminder":
      return meeting === null || context.meeting?.outcome !== "scheduled" ? [] : prospect(event.kind === "24h" ? "prospect_reminder_24h" : "prospect_reminder_1h", { when: meeting.when, meetUrl: meeting.meetUrl });
    case "outcome_nudge":
      return [{ template: "outcome_nudge", audience: SUPPLY_AND_FYNIX, params: base }];
  }
}

/** The people an email about a campaign (and no lead) can go to: the managers of its two sides. */
export type CampaignEmailAudience = "client_managers" | "coordinator_managers";

export interface CampaignEmailDelivery {
  readonly template: LaunchTemplate;
  readonly audience: readonly CampaignEmailAudience[];
  readonly params: LaunchParams;
}

/** Which emails a campaign event sends. Only a new agreement version sends one: both sides must accept it. */
export function campaignEmailDeliveries(event: CampaignNoticeEvent, campaign: { readonly campaignName: string }): readonly CampaignEmailDelivery[] {
  if (event.type !== "agreement_published") return [];
  return [{ template: "agreement_published_info", audience: ["client_managers", "coordinator_managers"], params: { campaignName: campaign.campaignName, version: event.version } }];
}
