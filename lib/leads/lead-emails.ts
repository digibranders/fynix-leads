import { formatMeetingTime, type LaunchParams, type LaunchTemplate } from "@/lib/email/launch-templates";
import { relayText } from "@/lib/relay/relay-text";
import type { LeadNoticeEvent } from "@/lib/leads/notices";

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
  | { readonly type: "outcome_nudge" };

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
        : [{ template: "no_show_info", audience: SUPPLY_AND_FYNIX, params: { ...base, outcome: event.outcome } }];
    case "lead_accepted":
      return [{ template: "lead_accepted_info", audience: SUPPLY_AND_FYNIX, params: base }];
    case "lead_rejected":
      return [{ template: "lead_rejected_info", audience: SUPPLY_AND_FYNIX, params: { ...base, note: noteOf(event.note), noteFrom: event.by === "fynix" ? "Fynix" : "Client" } }];
    case "rejection_overturned":
      return [{ template: "rejection_overturned_info", audience: ["source", "coordinator"], params: { ...base, note: noteOf(event.note), noteFrom: "Fynix" } }];
    case "lead_auto_accepted":
      return [{ template: "lead_auto_accepted_info", audience: SUPPLY_AND_FYNIX, params: base }];
    case "decision_reminder":
      return [{ template: "decision_reminder", audience: ["client"], params: { ...base, hoursLeft: event.hoursLeft } }];
    case "prospect_reminder":
      return meeting === null || context.meeting?.outcome !== "scheduled" ? [] : prospect(event.kind === "24h" ? "prospect_reminder_24h" : "prospect_reminder_1h", { when: meeting.when, meetUrl: meeting.meetUrl });
    case "outcome_nudge":
      return [{ template: "outcome_nudge", audience: SUPPLY_AND_FYNIX, params: base }];
    default:
      // postponement proposals, contests, review requests and the rest have notices in the app and no email: the table of the Meet note does not list them.
      return [];
  }
}
