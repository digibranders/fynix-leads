import type { ApprovalStatus, MeetingStatus } from "@/lib/domain/status";
import type { Decision, Lead } from "@/lib/domain/types";
import { relayText } from "@/lib/relay/relay-text";
import { lastMessageSide, type ThreadSide } from "./thread";

/**
 * What the agency may see of a lead (spec section 5: every read goes through a per-role serializer).
 * The agency sees the client brand and nothing else about the client: no rep names, no emails, no people.
 * Decisions carry no actor. Fields are listed one by one on purpose: never spread the source lead.
 */
export type AgencyLead = {
  ref: string;
  campaignRef: string;
  approval: ApprovalStatus;
  submittedAt: string;
  prospect: { name: string; title: string; company: string; companyDomain: string };
  meetings: { id: string; status: MeetingStatus; startsAt: string; durationMinutes: number }[];
  decision?: Pick<Decision, "outcome" | "reasonCode" | "note" | "decidedAt">;
  replacesRef?: string;
  /** Who wrote last in the clarification thread. The text itself stays on the server. */
  lastMessageSide: ThreadSide | null;
};

export function toAgencyView(lead: Lead): AgencyLead {
  const { prospect, decision } = lead;
  return {
    ref: lead.ref,
    campaignRef: lead.campaignRef,
    approval: lead.approval,
    submittedAt: lead.submittedAt,
    prospect: { name: prospect.name, title: prospect.title, company: prospect.company, companyDomain: prospect.companyDomain },
    meetings: lead.meetings.map((m) => ({ id: m.id, status: m.status, startsAt: m.startsAt, durationMinutes: m.durationMinutes })),
    decision: decision
      ? {
          outcome: decision.outcome,
          reasonCode: decision.reasonCode,
          // Scrubbed again here as defence in depth: the note was written by the client and relayed to the agency.
          note: relayText(decision.note ?? "").text || undefined,
          decidedAt: decision.decidedAt,
        }
      : undefined,
    replacesRef: lead.replacesRef,
    lastMessageSide: lastMessageSide(lead.thread),
  };
}
