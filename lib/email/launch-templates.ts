import { z } from "zod";
import { buttonHtml, linesHtml, LINK_REMOVED_TEXT, paragraphHtml, shellHtml } from "./design";
import type { CalendarMethod } from "./ics";
import { LETTER_OPENING_MAX, checkLetterOpening, tidyLetterOpening } from "./letter-opening";

/**
 * The launch emails (phase 6, "Emails at launch" in the Meet note): one template per audience and event. Pure functions from content to text and HTML, like
 * the account emails in templates.ts, which dispatches here.
 *
 * Two kinds, told apart by name:
 * - `prospect_*` letters go to the person the meeting is with. They carry no link to the portal (only a Meet link, whose host is checked below), never name
 *   Fynix, the coordinator or an agency, and end with the signer's name and the privacy line. The signer, the client's brand and the privacy link are put into
 *   the params by the database function that queues the letter, from rows the sender is not allowed to read.
 * - every other template goes to a person of the portal and carries a link to the lead in that person's own portal.
 * Sentence case, plain verbs, no exclamation marks, no em or en dashes.
 */
export const LAUNCH_TEMPLATES = [
  "lead_waiting",
  "lead_submitted_info",
  "times_proposed_info",
  "meeting_booked",
  "meeting_moved",
  "meeting_cancelled",
  "outcome_nudge",
  "outcome_held_client",
  "outcome_held_info",
  "decision_reminder",
  "lead_accepted_info",
  "lead_rejected_info",
  "lead_auto_accepted_info",
  "rejection_overturned_info",
  "no_show_info",
  "lead_auto_accepted_client",
  "rejection_overturned_client",
  "client_no_show_client",
  "postponement_proposed_info",
  "outcome_contested_info",
  "contest_decided_info",
  "review_requested_info",
  "agreement_published_info",
  "campaign_update_info",
  "target_met_info",
  "share_met_info",
  "over_share_info",
  "leads_waiting_daily",
  "leads_waiting_summary",
  "meeting_invitation",
  "prospect_confirmed",
  "prospect_moved",
  "prospect_cancelled",
  "prospect_reminder_24h",
  "prospect_reminder_1h",
] as const;
export type LaunchTemplate = (typeof LAUNCH_TEMPLATES)[number];

export const isLaunchTemplate = (template: string): template is LaunchTemplate => (LAUNCH_TEMPLATES as readonly string[]).includes(template);
export const isProspectTemplate = (template: string): boolean => template.startsWith("prospect_");

/** The only host a meeting link may have. A prospect letter carries it in the body, so a stored link anywhere else is refused. */
export const MEET_HOST = "meet.google.com";

export function isMeetUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === MEET_HOST && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

const text = z.string().min(1).max(500);
/** The most clients Fynix's daily summary carries. The email lists the first twenty by name and says how many more there are. */
export const SUMMARY_CLIENTS_MAX = 200;
const meetUrl = z.string().max(200).refine(isMeetUrl, `must be an https link on ${MEET_HOST}`);

const paramsSchema = z.object({
  /** The lead's public reference, `LD-ABCD`. People of the portal only. */
  ref: text.optional(),
  /** The prospect's company, as on the notices. People of the portal only. */
  company: text.optional(),
  /** The meeting time, already written out in the campaign's time zone. */
  when: text.optional(),
  meetUrl: meetUrl.nullish(),
  /** A note a person typed, with contact details already taken out. */
  note: z.string().max(1000).optional(),
  noteFrom: text.optional(),
  hoursLeft: z.number().int().min(0).max(48).optional(),
  outcome: z.enum(["client_no_show", "prospect_no_show"]).optional(),
  reason: z.enum(["rejected", "withdrawn", "closed"]).optional(),
  /** Which side asked to move the meeting. The other side is the one that picks. */
  proposedBy: z.enum(["client", "supply"]).optional(),
  /** The outcome Fynix settled a contest on. */
  decided: z.enum(["held", "client_no_show", "prospect_no_show"]).optional(),
  /** What the calendar file is built from. The recipient and the sender are added when the message is sent. */
  calendar: z.object({ meetingRef: z.string().regex(/^MTG-[0-9A-HJKMNP-TV-Z]{4}$/), startsAt: z.iso.datetime(), endsAt: z.iso.datetime(), sequence: z.number().int().min(0) }).optional(),
  /** A campaign's name, for an email about a campaign or a target. Never in a prospect letter. */
  campaignName: text.optional(),
  /** The deadline of an invitation, already written out in the campaign's time zone. */
  replyBy: text.optional(),
  /** A month written out, "November 2026". */
  period: text.optional(),
  // As wide as the database's own integers: a count that is merely large must never stop the acceptance that completed a target.
  reached: z.number().int().min(0).max(2_147_483_647).optional(),
  target: z.number().int().min(1).max(2_147_483_647).optional(),
  /** Whether a met target is the month's or the campaign's total. */
  scope: z.enum(["month", "total"]).optional(),
  /** How many leads wait for a time. */
  waiting: z.number().int().min(1).max(2_147_483_647).optional(),
  /** Fynix's daily summary: each client with leads waiting, and how many. The sweep sends at most `SUMMARY_CLIENTS_MAX`. */
  clients: z.array(z.object({ name: text, waiting: z.number().int().min(1).max(2_147_483_647) })).min(1).max(SUMMARY_CLIENTS_MAX).optional(),
  /** What happened to a campaign, for the one email about a campaign that is not an agreement. */
  change: z.enum(["active", "assigned", "shared", "unshared"]).optional(),
  /** An agreement's version number. */
  version: z.number().int().min(1).max(100_000).optional(),
  // Added by the database for a prospect letter:
  prospectName: text.optional(),
  clientBrand: text.optional(),
  privacyUrl: z.string().max(500).refine((value) => /^https:\/\/\S+$/.test(value), "must be an https link").optional(),
  signerName: text.optional(),
  signerTitle: text.optional(),
  /** The campaign's own opening paragraph for the confirmation letter, when Fynix wrote one. Checked again when the letter is rendered. */
  letterOpening: z.string().max(LETTER_OPENING_MAX * 2).optional(),
});
export type LaunchParams = z.infer<typeof paramsSchema>;
export type LaunchContent = { readonly template: LaunchTemplate; readonly params: LaunchParams };

type Field = keyof LaunchParams;
const PROSPECT_BASE: readonly Field[] = ["prospectName", "clientBrand", "privacyUrl", "signerName", "signerTitle"];
const PORTAL_BASE: readonly Field[] = ["ref", "company"];
const REQUIRED: Readonly<Record<LaunchTemplate, readonly Field[]>> = {
  lead_waiting: PORTAL_BASE,
  lead_submitted_info: PORTAL_BASE,
  times_proposed_info: PORTAL_BASE,
  meeting_booked: [...PORTAL_BASE, "when", "calendar"],
  meeting_moved: [...PORTAL_BASE, "when", "calendar"],
  meeting_cancelled: [...PORTAL_BASE, "reason"],
  outcome_nudge: PORTAL_BASE,
  outcome_held_client: PORTAL_BASE,
  outcome_held_info: PORTAL_BASE,
  decision_reminder: [...PORTAL_BASE, "hoursLeft"],
  lead_accepted_info: PORTAL_BASE,
  lead_rejected_info: PORTAL_BASE,
  lead_auto_accepted_info: PORTAL_BASE,
  rejection_overturned_info: PORTAL_BASE,
  no_show_info: [...PORTAL_BASE, "outcome"],
  lead_auto_accepted_client: PORTAL_BASE,
  rejection_overturned_client: PORTAL_BASE,
  client_no_show_client: PORTAL_BASE,
  postponement_proposed_info: [...PORTAL_BASE, "proposedBy"],
  outcome_contested_info: [...PORTAL_BASE, "note", "noteFrom"],
  contest_decided_info: [...PORTAL_BASE, "decided"],
  review_requested_info: PORTAL_BASE,
  agreement_published_info: ["campaignName", "version"],
  campaign_update_info: ["campaignName", "change"],
  target_met_info: [...PORTAL_BASE, "campaignName", "scope", "reached", "target"],
  share_met_info: [...PORTAL_BASE, "campaignName", "period", "reached", "target"],
  over_share_info: PORTAL_BASE,
  leads_waiting_daily: [...PORTAL_BASE, "waiting"],
  leads_waiting_summary: [...PORTAL_BASE, "clients"],
  meeting_invitation: [...PORTAL_BASE, "when", "replyBy", "campaignName"],
  prospect_confirmed: [...PROSPECT_BASE, "when", "calendar"],
  prospect_moved: [...PROSPECT_BASE, "when", "calendar"],
  prospect_cancelled: [...PROSPECT_BASE, "calendar"],
  prospect_reminder_24h: [...PROSPECT_BASE, "when"],
  prospect_reminder_1h: [...PROSPECT_BASE, "when"],
};

/**
 * Reads stored params back into typed content, or throws. Anything in the table is not trusted to be well formed. `beforeDatabase` is for the one caller that
 * checks a prospect letter's params before the database adds the brand, the signer and the privacy link to them.
 */
export function parseLaunchContent(template: LaunchTemplate, params: unknown, options: { readonly beforeDatabase?: boolean } = {}): LaunchContent {
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) throw new Error(`${template} has params that are not valid.`);
  const added: readonly Field[] = options.beforeDatabase === true ? PROSPECT_BASE : [];
  const missing = REQUIRED[template].filter((field) => !added.includes(field) && parsed.data[field] === undefined);
  if (missing.length > 0) throw new Error(`${template} needs ${missing.join(", ")}.`);
  return { template, params: parsed.data };
}

/** "Tuesday 8 December 2026, 14:30 Europe/London": a time written out for the person reading, in a named zone. */
export function formatMeetingTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).formatToParts(date);
  const part = (type: string): string => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")} ${part("year")}, ${part("hour")}:${part("minute")} ${timeZone}`;
}

interface Layout {
  readonly subject: string;
  readonly paragraphs: readonly string[];
  /** A line giving the Meet link, or saying it will follow. */
  readonly join: boolean;
  /** What the link opens, when it is not simply the lead: the line above the button and the button's own words. */
  readonly open?: { readonly intro: string; readonly label: string };
}

const leads = (count: number): string => (count === 1 ? "1 lead" : `${count} leads`);
/** How many clients Fynix's summary lists by name before it says how many more there are. */
const SUMMARY_LINES = 20;

/** The same three lines as the notices in the app (`lib/leads/notices.ts`). */
const DECIDED_LINE: Readonly<Record<"held" | "client_no_show" | "prospect_no_show", string>> = {
  held: "The meeting was held.",
  client_no_show: "The client did not attend. It counts as one.",
  prospect_no_show: "The prospect did not attend. The lead is closed and counts as zero.",
};

const need = <T,>(value: T | undefined): T => {
  if (value === undefined) throw new Error("A launch email was rendered without a field its template requires.");
  return value;
};

function portalLayout(content: LaunchContent): Layout {
  const { params } = content;
  // The one email about a campaign and no lead.
  if (content.template === "agreement_published_info") {
    return {
      subject: `Agreement version ${need(params.version)} for ${need(params.campaignName)} needs your acceptance`,
      paragraphs: ["A new version of the agreement is published.", "The old one stays in force until both sides accept the new one. Open it, read it and accept it."],
      join: false,
      open: { intro: "Open the agreement:", label: "Open the agreement" },
    };
  }
  if (content.template === "campaign_update_info") {
    const name = need(params.campaignName);
    const lines = {
      active: { subject: `The campaign ${name} is active`, paragraphs: ["Leads can now be submitted for this campaign.", "Open it to see the brief, the agreement and the leads."] },
      assigned: { subject: `The campaign ${name} is assigned to you`, paragraphs: ["Fynix gave this campaign to your organisation.", "Open it to read the brief and the agreement."] },
      shared: { subject: `The campaign ${name} is shared with you`, paragraphs: ["You can submit leads for this campaign once it is active.", "Open it to see the brief."] },
      unshared: { subject: `The campaign ${name} is no longer shared with you`, paragraphs: ["You cannot submit new leads for it. Leads already sent finish their course."] },
    }[need(params.change)];
    return { ...lines, join: false, open: { intro: "Open the campaign:", label: "Open the campaign" } };
  }
  const ref = need(params.ref);
  const company = need(params.company);
  const note = params.note === undefined || params.note === "" ? [] : [`Note from ${params.noteFrom ?? "Client"}: ${params.note}`];
  switch (content.template) {
    case "lead_waiting":
      return { subject: `Lead ${ref} is waiting for a time`, paragraphs: [`A lead from ${company} is ready for your review.`, "Pick one of the proposed times or propose others."], join: false };
    case "meeting_invitation":
      return {
        subject: `A meeting with ${company} is waiting for your reply`,
        paragraphs: [
          `A meeting with ${company} is booked for ${need(params.when)}. It is for the campaign ${need(params.campaignName)}.`,
          "The first person from your team to accept takes the meeting, and the others are let go.",
          `Please reply by ${need(params.replyBy)}. If nobody accepts by then, a new time is found.`,
        ],
        join: false,
        open: { intro: "Accept or decline the meeting:", label: "Accept or decline" },
      };
    case "lead_submitted_info":
      return { subject: `Lead ${ref} was submitted`, paragraphs: [`Lead ${ref} from ${company} was submitted.`, "It now waits for the client to pick a time."], join: false };
    case "times_proposed_info":
      return { subject: `The client proposed other times for ${ref}`, paragraphs: [`The client could not use the times offered for ${company}.`, "Pick one of the new times."], join: false };
    case "meeting_booked":
      return { subject: `Meeting booked for ${ref}`, paragraphs: [`A meeting with ${company} is booked for ${need(params.when)}.`, "A calendar file is attached."], join: true };
    case "meeting_moved":
      return { subject: `Meeting moved for ${ref}`, paragraphs: [`The meeting with ${company} moved to ${need(params.when)}.`, "The calendar file attached replaces the earlier one."], join: true };
    case "meeting_cancelled": {
      const what = { rejected: "was rejected before the meeting", withdrawn: "was withdrawn before the meeting", closed: "was closed" }[need(params.reason)];
      return { subject: `Meeting cancelled for ${ref}`, paragraphs: [`Lead ${ref} from ${company} ${what}. The meeting will not take place.`, ...note, ...(params.calendar === undefined ? [] : ["The calendar file attached removes it from your calendar."])], join: false };
    }
    case "outcome_nudge":
      return { subject: `Record the outcome of ${ref}`, paragraphs: [`The meeting with ${company} has ended and no outcome is recorded yet.`, "Record whether it was held or whether someone did not attend."], join: false };
    case "outcome_held_client":
      return {
        subject: `Accept or reject lead ${ref}`,
        paragraphs: [`The meeting with ${company} was held.`, "Accept or reject the lead and add a note. If there is no answer, the lead is accepted automatically 48 hours after the outcome was recorded."],
        join: false,
      };
    case "outcome_held_info":
      return { subject: `Outcome recorded for ${ref}`, paragraphs: [`The meeting with ${company} was held.`, "The client now decides whether to accept the lead."], join: false };
    case "decision_reminder": {
      const hours = need(params.hoursLeft);
      const left = hours === 1 ? "1 hour" : `${hours} hours`;
      return hours <= 12
        ? {
            subject: `Final reminder: lead ${ref} is accepted automatically in ${left}`,
            paragraphs: [`This is the last reminder. In ${left} lead ${ref} from ${company} is accepted automatically and counts as one.`, "To answer it yourself, accept or reject the lead now and add a note."],
            join: false,
          }
        : {
            subject: `Reminder: accept or reject lead ${ref}`,
            paragraphs: [`Lead ${ref} from ${company} still waits for your answer. ${left} are left before it is accepted automatically.`, "Accept or reject the lead and add a note."],
            join: false,
          };
    }
    case "lead_accepted_info":
      return { subject: `Lead ${ref} was accepted`, paragraphs: [`Lead ${ref} from ${company} was accepted. It counts as one.`], join: false };
    case "lead_rejected_info":
      return { subject: `Lead ${ref} was rejected`, paragraphs: [`Lead ${ref} from ${company} was rejected after the meeting. It counts as zero.`, ...note], join: false };
    case "lead_auto_accepted_info":
      return { subject: `Lead ${ref} was accepted automatically`, paragraphs: [`The client did not answer within 48 hours, so lead ${ref} from ${company} was accepted. It counts as one.`], join: false };
    case "rejection_overturned_info":
      return { subject: `The rejection of ${ref} was changed to accepted`, paragraphs: [`The rejection of lead ${ref} from ${company} was changed to accepted. It counts as one.`, ...note], join: false };
    case "no_show_info":
      return need(params.outcome) === "client_no_show"
        ? { subject: `The client did not attend the meeting for ${ref}`, paragraphs: [`The client did not attend the meeting with ${company}. The lead counts as one.`], join: false }
        : { subject: `The prospect did not attend the meeting for ${ref}`, paragraphs: [`The prospect from ${company} did not attend the meeting. The lead is closed and counts as zero.`], join: false };
    case "lead_auto_accepted_client":
      return { subject: `Lead ${ref} was accepted automatically`, paragraphs: [`No answer was recorded within 48 hours of the meeting with ${company}, so lead ${ref} was accepted. It counts as one.`], join: false };
    case "rejection_overturned_client":
      return { subject: `Fynix changed your rejection of ${ref} to accepted`, paragraphs: [`Fynix looked again at your rejection of lead ${ref} from ${company} and changed it to accepted. It counts as one.`, ...note], join: false };
    case "client_no_show_client":
      return {
        subject: `Your team did not attend the meeting for ${ref}`,
        paragraphs: [`The meeting with ${company} was recorded as a client no-show: nobody from your team attended. The lead counts as one.`, "If this is wrong, open the lead and contest the outcome. Fynix then decides."],
        join: false,
      };
    case "postponement_proposed_info":
      return need(params.proposedBy) === "client"
        ? { subject: `The client proposed new times for ${ref}`, paragraphs: [`The client asks to move the meeting with ${company}.`, "Pick one of the new times."], join: false }
        : { subject: `New times proposed for ${ref}`, paragraphs: [`The meeting with ${company} needs a new time.`, "Pick one of the proposed times."], join: false };
    case "outcome_contested_info":
      return { subject: `The outcome of ${ref} is contested`, paragraphs: [`The recorded outcome of the meeting with ${company} is contested.`, ...note, "Fynix decides."], join: false };
    case "contest_decided_info":
      return { subject: `Fynix decided the contest on ${ref}`, paragraphs: [`Fynix decided the contested outcome of the meeting with ${company}.`, DECIDED_LINE[need(params.decided)], ...note], join: false };
    case "review_requested_info":
      return { subject: `A review of the rejection of ${ref} was asked for`, paragraphs: [`The coordinator asks Fynix to look again at the rejection of lead ${ref} from ${company}.`], join: false };
    case "target_met_info": {
      const campaign = need(params.campaignName);
      const monthly = need(params.scope) === "month";
      return {
        subject: monthly ? `${campaign} reached its target for ${need(params.period)}` : `${campaign} reached its total target`,
        paragraphs: [`${leads(need(params.reached))} now ${need(params.reached) === 1 ? "counts" : "count"} ${monthly ? `for ${need(params.period)}` : "in total"}. The target is ${need(params.target)}.`, `Lead ${ref} from ${company} completed it.`],
        join: false,
        open: { intro: "Open the lead that completed it:", label: "Open the lead" },
      };
    }
    case "share_met_info":
      return {
        subject: `You reached your share for ${need(params.period)}`,
        paragraphs: [`${need(params.reached)} of your leads for ${need(params.campaignName)} now count for ${need(params.period)}. Your share is ${need(params.target)}.`, `Lead ${ref} from ${company} completed it.`],
        join: false,
        open: { intro: "Open the lead that completed it:", label: "Open the lead" },
      };
    case "over_share_info":
      return { subject: `Lead ${ref} is beyond its sender's share`, paragraphs: [`Lead ${ref} from ${company} takes the agency that sent it past its share for the month.`, "Approve it or leave it flagged."], join: false };
    case "leads_waiting_daily": {
      const count = need(params.waiting);
      return {
        subject: `${leads(count)} ${count === 1 ? "is" : "are"} waiting for a time`,
        paragraphs: [`${leads(count)} ${count === 1 ? "has" : "have"} waited more than 24 hours for you to pick a meeting time. The oldest is ${ref} from ${company}.`, "Pick one of the proposed times or propose others."],
        join: false,
        open: { intro: "Open the oldest lead:", label: "Open the oldest lead" },
      };
    }
    case "leads_waiting_summary": {
      const clients = need(params.clients);
      const more = clients.length - SUMMARY_LINES;
      return {
        subject: "Leads waiting for a client to pick a time",
        paragraphs: [
          "These clients have leads that have waited more than 24 hours for a meeting time.",
          ...clients.slice(0, SUMMARY_LINES).map((entry) => `${entry.name}: ${leads(entry.waiting)}`),
          ...(more > 0 ? [`And ${more} more ${more === 1 ? "client" : "clients"}.`] : []),
          `The one that has waited longest is ${ref} from ${company}.`,
        ],
        join: false,
        open: { intro: "Open the lead that has waited longest:", label: "Open the lead" },
      };
    }
    default:
      throw new Error(`${content.template} is not a portal email.`);
  }
}

function prospectLayout(content: LaunchContent): Layout {
  const { params } = content;
  const brand = need(params.clientBrand);
  const hello = `Hello ${need(params.prospectName)},`;
  switch (content.template) {
    case "prospect_confirmed": {
      // A paragraph that no longer passes its check is left out, and the default wording goes out: this field never holds a letter back.
      const opening = params.letterOpening !== undefined && checkLetterOpening(params.letterOpening).ok ? tidyLetterOpening(params.letterOpening) : null;
      const confirmed = `Your meeting is confirmed for ${need(params.when)}.`;
      return {
        subject: `Your meeting with ${brand} is confirmed`,
        paragraphs: opening === null ? [hello, `Thank you for agreeing to talk. ${confirmed}`, "A calendar invitation is attached."] : [hello, opening, confirmed, "A calendar invitation is attached."],
        join: true,
      };
    }
    case "prospect_moved":
      return { subject: `Your meeting with ${brand} has a new time`, paragraphs: [hello, `Your meeting moved to ${need(params.when)}. The link to join stays the same.`, "A calendar update is attached."], join: true };
    case "prospect_cancelled":
      return { subject: `Your meeting with ${brand} is cancelled`, paragraphs: [hello, "Your meeting will not take place. We are sorry for the change.", "A calendar update is attached that removes it from your calendar."], join: false };
    case "prospect_reminder_24h":
      return { subject: `Reminder: your meeting with ${brand} is tomorrow`, paragraphs: [hello, `A reminder that your meeting is on ${need(params.when)}.`], join: true };
    case "prospect_reminder_1h":
      return { subject: `Your meeting with ${brand} starts in an hour`, paragraphs: [hello, `Your meeting starts at ${need(params.when)}.`], join: true };
    default:
      throw new Error(`${content.template} is not a prospect letter.`);
  }
}

/** The signature and the privacy line of a prospect letter, as lines. The privacy wording is the owner's draft of 2026-11-24. */
export function prospectFooterLines(params: LaunchParams): { readonly signature: readonly string[]; readonly privacy: readonly string[] } {
  return {
    signature: ["Best regards,", need(params.signerName), `${need(params.signerTitle)}, ${need(params.clientBrand)}`],
    privacy: [`${need(params.clientBrand)} holds your contact details to arrange this meeting. Privacy policy: ${need(params.privacyUrl)}`, "To have your details removed, reply to this email."],
  };
}

export interface RenderedLaunchEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** The subject, plain text and HTML. A portal email carries `link` (null in the stored copy, which says it is not kept); a prospect letter carries none. */
export function renderLaunchEmail(content: LaunchContent, link: string | null): RenderedLaunchEmail {
  if (isProspectTemplate(content.template)) {
    const layout = prospectLayout(content);
    const { signature, privacy } = prospectFooterLines(content.params);
    const url = content.params.meetUrl ?? null;
    const joinText = layout.join ? [url === null ? "The link to join will be sent to you before the meeting." : `Join the meeting: ${url}`] : [];
    const textBody = [...layout.paragraphs, ...joinText, "", ...signature, "", ...privacy].join("\n");
    const joinHtml = !layout.join ? "" : url === null ? paragraphHtml(joinText[0] ?? "") : buttonHtml("Join the meeting", url);
    const html = shellHtml(`${layout.paragraphs.map(paragraphHtml).join("")}${joinHtml}${linesHtml(signature)}${linesHtml(privacy, true)}`, null);
    return { subject: layout.subject, text: textBody, html };
  }
  const layout = portalLayout(content);
  const url = content.params.meetUrl ?? null;
  const joinText = layout.join ? [url === null ? "The link to join will follow." : `Join link: ${url}`] : [];
  const { intro, label } = layout.open ?? { intro: "Open the lead:", label: "Open the lead" };
  const textBody = [...layout.paragraphs, ...joinText, "", intro, link ?? LINK_REMOVED_TEXT].join("\n");
  const joinHtml = layout.join ? paragraphHtml(joinText[0] ?? "") : "";
  const action = link === null ? `${paragraphHtml(intro)}${paragraphHtml(LINK_REMOVED_TEXT)}` : `${paragraphHtml(intro)}${buttonHtml(label, link)}`;
  return { subject: layout.subject, text: textBody, html: shellHtml(`${layout.paragraphs.map(paragraphHtml).join("")}${joinHtml}${action}`, "Fynix Leads") };
}

export interface CalendarSpec {
  readonly meetingRef: string;
  readonly sequence: number;
  readonly method: CalendarMethod;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly summary: string;
  readonly location: string | null;
}

/** What the calendar file of a message is built from, or null when it has none. The recipient and the sender are added when it is sent. */
export function launchCalendar(content: LaunchContent): CalendarSpec | null {
  const { params, template } = content;
  const calendar = params.calendar;
  if (calendar === undefined) return null;
  if (!["meeting_booked", "meeting_moved", "meeting_cancelled", "prospect_confirmed", "prospect_moved", "prospect_cancelled"].includes(template)) return null;
  const summary = isProspectTemplate(template) ? `Meeting with ${need(params.clientBrand)}` : `Meeting with ${need(params.company)} (${need(params.ref)})`;
  return {
    meetingRef: calendar.meetingRef,
    sequence: calendar.sequence,
    method: template.endsWith("_cancelled") ? "CANCEL" : "REQUEST",
    startsAt: new Date(calendar.startsAt),
    endsAt: new Date(calendar.endsAt),
    summary,
    location: params.meetUrl ?? null,
  };
}
