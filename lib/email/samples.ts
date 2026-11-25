import type { InvariantContext } from "./invariants";
import type { LaunchContent, LaunchParams } from "./launch-templates";
import type { EmailContent, EmailTemplate } from "./templates";

/**
 * Sample content for the email templates screen: every name, company, address and reference below is made up and says so ("Sample ..."), and the web addresses end
 * in `.test`, which can never be registered. The meeting address has the shape of a Meet link and points at no room. Nothing here is read from the database.
 */
export const SAMPLE_PORTAL_LINK = "https://portal.example.test/client/leads/LD-SAMP";
const MEET = "https://meet.google.com/aaa-bbbb-ccc";
const PRIVACY = "https://privacy.example.test/sample-policy";
const WHEN = "Tuesday 8 December 2026, 14:30 Europe/London";
const CALENDAR = { meetingRef: "MTG-SAMP", startsAt: "2026-12-08T14:30:00.000Z", endsAt: "2026-12-08T15:00:00.000Z", sequence: 1 } as const;
const SAMPLE_COORDINATOR = "Sample Coordinator Ltd";
const SAMPLE_AGENCY = "Sample Agency Ltd";

const PORTAL: LaunchParams = { ref: "LD-SAMP", company: "Sample Prospect Co", when: WHEN, meetUrl: MEET, calendar: CALENDAR };
const PROSPECT: LaunchParams = {
  prospectName: "Sample Person",
  clientBrand: "Sample Client",
  privacyUrl: PRIVACY,
  signerName: "Sample Signer",
  signerTitle: "Business development",
  when: WHEN,
  meetUrl: MEET,
  calendar: CALENDAR,
};
const portal = (template: LaunchContent["template"], extra: LaunchParams = {}): EmailContent => ({ template, params: { ...PORTAL, ...extra } }) as EmailContent;
const prospect = (template: LaunchContent["template"]): EmailContent => ({ template, params: PROSPECT }) as EmailContent;

/** One sample per template. Typed over every template, so a template added without a sample fails the typecheck. */
export const SAMPLES: Readonly<Record<EmailTemplate, EmailContent>> = {
  password_reset: { template: "password_reset", params: { expiresInMinutes: 60 } },
  invite: { template: "invite", params: { name: "Sample Person", organisationName: "Sample Client Ltd", expiresOn: "8 December 2026" } },
  alias_code: { template: "alias_code", params: { displayName: "Sample Alias", code: "123456" } },
  lead_waiting: portal("lead_waiting"),
  lead_submitted_info: portal("lead_submitted_info"),
  times_proposed_info: portal("times_proposed_info"),
  meeting_booked: portal("meeting_booked"),
  meeting_moved: portal("meeting_moved"),
  meeting_cancelled: portal("meeting_cancelled", { reason: "rejected", note: "This is a sample note, not a real one.", noteFrom: "Client" }),
  outcome_nudge: portal("outcome_nudge"),
  outcome_held_client: portal("outcome_held_client"),
  outcome_held_info: portal("outcome_held_info"),
  decision_reminder: portal("decision_reminder", { hoursLeft: 24 }),
  lead_accepted_info: portal("lead_accepted_info"),
  lead_rejected_info: portal("lead_rejected_info", { note: "This is a sample note, not a real one.", noteFrom: "Client" }),
  lead_auto_accepted_info: portal("lead_auto_accepted_info"),
  rejection_overturned_info: portal("rejection_overturned_info", { note: "This is a sample note, not a real one.", noteFrom: "Fynix" }),
  no_show_info: portal("no_show_info", { outcome: "client_no_show" }),
  lead_auto_accepted_client: portal("lead_auto_accepted_client"),
  rejection_overturned_client: portal("rejection_overturned_client", { note: "This is a sample note, not a real one.", noteFrom: "Fynix" }),
  client_no_show_client: portal("client_no_show_client"),
  postponement_proposed_info: portal("postponement_proposed_info", { proposedBy: "client" }),
  outcome_contested_info: portal("outcome_contested_info", { note: "This is a sample note, not a real one.", noteFrom: "Agency" }),
  contest_decided_info: portal("contest_decided_info", { decided: "held", note: "This is a sample note, not a real one.", noteFrom: "Fynix" }),
  review_requested_info: portal("review_requested_info"),
  prospect_confirmed: prospect("prospect_confirmed"),
  prospect_moved: prospect("prospect_moved"),
  prospect_cancelled: prospect("prospect_cancelled"),
  prospect_reminder_24h: prospect("prospect_reminder_24h"),
  prospect_reminder_1h: prospect("prospect_reminder_1h"),
};

/** The rules for the samples: the sample link, the two addresses a letter may hold, and the names a letter must never carry. */
export const SAMPLE_INVARIANT_CONTEXT: InvariantContext = {
  portalLink: SAMPLE_PORTAL_LINK,
  allowedProspectUrls: [MEET, PRIVACY],
  forbiddenInProspect: [/fynix/i, new RegExp(SAMPLE_COORDINATOR, "i"), new RegExp(SAMPLE_AGENCY, "i"), /Open the lead/, /portal\.example\.test/, /\/client\/leads/],
};

export interface CatalogEntry {
  readonly template: EmailTemplate;
  readonly title: string;
  /** When it is sent, in one plain sentence. */
  readonly when: string;
}
export interface CatalogGroup {
  readonly audience: string;
  readonly entries: readonly CatalogEntry[];
}

/** Every template, grouped by who receives it. */
export const CATALOG: readonly CatalogGroup[] = [
  {
    audience: "Account emails, to the person the account is for",
    entries: [
      { template: "invite", title: "Invite", when: "A Fynix admin invites someone." },
      { template: "password_reset", title: "Password reset", when: "Someone asks for a new password." },
      { template: "alias_code", title: "Alias verification code", when: "An agency person starts using a client name." },
    ],
  },
  {
    audience: "The client",
    entries: [
      { template: "lead_waiting", title: "A lead is waiting", when: "An agency submits a lead for the client." },
      { template: "outcome_held_client", title: "Meeting held", when: "Someone records that the meeting took place." },
      { template: "decision_reminder", title: "Reminder to accept or reject", when: "The client has not decided 12, 24 and 36 hours after the meeting." },
      { template: "lead_auto_accepted_client", title: "Accepted automatically", when: "48 hours pass with no answer from the client." },
      { template: "rejection_overturned_client", title: "Rejection changed", when: "Fynix changes the client's rejection to accepted." },
      { template: "client_no_show_client", title: "Client no show", when: "Someone records that the client did not attend." },
    ],
  },
  {
    audience: "Whoever is involved: new times, contests and reviews",
    entries: [
      { template: "postponement_proposed_info", title: "New times proposed", when: "One side asks to move a booked meeting. It goes to the side that picks, and to Fynix." },
      { template: "outcome_contested_info", title: "Outcome contested", when: "The client, the agency or the coordinator contests a recorded outcome." },
      { template: "contest_decided_info", title: "Contest decided", when: "Fynix decides a contested outcome." },
      { template: "review_requested_info", title: "Review asked for", when: "The coordinator asks Fynix to look at a rejection again. It goes to Fynix." },
    ],
  },
  {
    audience: "Meeting emails: the client's meeting contacts, the agency, the coordinator and Fynix",
    entries: [
      { template: "meeting_booked", title: "Meeting booked", when: "A time is picked." },
      { template: "meeting_moved", title: "Meeting moved", when: "A meeting is postponed to a new time." },
      { template: "meeting_cancelled", title: "Meeting cancelled", when: "A lead is rejected before the meeting, withdrawn or lost." },
    ],
  },
  {
    audience: "The agency, the coordinator and Fynix",
    entries: [
      { template: "lead_submitted_info", title: "Lead submitted", when: "A lead is submitted." },
      { template: "times_proposed_info", title: "Times proposed", when: "New times are proposed for a meeting." },
      { template: "outcome_nudge", title: "Record the outcome", when: "A meeting has ended and no outcome is recorded." },
      { template: "outcome_held_info", title: "Meeting held", when: "Someone records that the meeting took place." },
      { template: "no_show_info", title: "No show", when: "A no show is recorded." },
      { template: "lead_accepted_info", title: "Lead accepted", when: "The client accepts the lead." },
      { template: "lead_rejected_info", title: "Lead rejected", when: "The client rejects the lead after the meeting." },
      { template: "lead_auto_accepted_info", title: "Accepted automatically", when: "48 hours pass with no answer from the client." },
      { template: "rejection_overturned_info", title: "Rejection changed", when: "Fynix changes a rejection to accepted." },
    ],
  },
  {
    audience: "The prospect",
    entries: [
      { template: "prospect_confirmed", title: "Meeting confirmed", when: "A time is picked." },
      { template: "prospect_moved", title: "Meeting moved", when: "The meeting is postponed." },
      { template: "prospect_cancelled", title: "Meeting cancelled", when: "The meeting is cancelled." },
      { template: "prospect_reminder_24h", title: "Reminder, a day before", when: "24 hours before the meeting." },
      { template: "prospect_reminder_1h", title: "Reminder, an hour before", when: "One hour before the meeting." },
    ],
  },
];
