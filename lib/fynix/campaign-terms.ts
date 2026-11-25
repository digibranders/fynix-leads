import { AUTO_ACCEPT_HOURS } from "@/lib/leads/decision-queue";

/**
 * The terms every campaign runs under, shown read only on the last step of New campaign. They are fixed text: only the person who approves
 * leads is filled in from what was chosen on the first step. The rules they describe are the ones the app already applies (the 48 hour
 * automatic acceptance, a client no-show counting as a qualified lead), so the page and the product say the same thing.
 */
export interface TermRow {
  readonly term: string;
  readonly description: string;
}

/** Who approves leads, as the terms name them: the contact person chosen, or a plain phrase when none is chosen yet. */
export function approverPhrase(approverName: string | null): string {
  return approverName === null || approverName.trim() === "" ? "The client's nominated contact person" : approverName.trim();
}

export function meetingTerms(approverName: string | null): readonly TermRow[] {
  return [
    { term: "Meeting platform", description: "All scheduled meetings will be conducted through Google Meet." },
    { term: "Client team availability", description: "A minimum of two client team members must remain available and responsive for meeting coordination. At least one of these members must attend each scheduled meeting." },
    {
      term: "Lead approval and feedback",
      description: `${approverPhrase(approverName)} will be responsible for approving the count of qualified leads. Feedback must be provided immediately after each meeting. If no feedback is received within 48 hours of the meeting, the lead will automatically be considered qualified.`,
    },
    { term: "Client no-show", description: "If the client fails to attend a scheduled meeting, the lead will still be counted as a qualified lead." },
    { term: "Meeting rescheduling", description: "Once a meeting has been scheduled and confirmed, the client will not be permitted to request a rescheduling." },
    { term: "Prospect no-show", description: "If a prospect fails to attend a scheduled meeting, Fynix Digital will make reasonable efforts to reschedule the meeting or provide a replacement lead." },
    { term: "Calendar access", description: "The client must provide Fynix Digital with calendar access for two designated team members to facilitate meeting scheduling and coordination." },
    { term: "Meeting notifications", description: "All meeting-related notifications and calendar invitations will be sent from calendar@meetingscheduled.in (tentative; subject to final confirmation)." },
  ];
}

export const REPORTING_PROTOCOL: readonly string[] = [
  "The prospect research, outreach, follow-up, and meeting coordination process will be managed internally by Fynix Digital. The client will not be required to monitor these activities or receive individual progress updates while they are underway.",
  "Fynix Digital will notify the client directly once a meeting has been confirmed, sharing the scheduled date, time, and relevant prospect information. The client's involvement will therefore be focused on attending scheduled meetings and providing post-meeting feedback.",
];

/** The counting rules a new agreement starts from, in words. They state what the app already does, so the agreement and the product agree. */
export const DEFAULT_COUNTING_RULES = [
  "A meeting counts once the client accepts it after it has been held, and it counts in the month the meeting was held.",
  `If the client gives no answer within ${AUTO_ACCEPT_HOURS} hours of the meeting, the lead is accepted automatically.`,
  "If the client does not attend a scheduled meeting, the lead still counts as a qualified lead.",
  "If a prospect does not attend, the meeting counts as zero. Fynix Digital makes reasonable efforts to reschedule it or to provide a replacement lead.",
  "Once a meeting is confirmed, the client cannot ask to reschedule it.",
].join("\n");
