import type { LeadActionContext } from "@/components/leads/lead-action-bar";
import type { LeadViewer } from "@/lib/leads/lead-actions";
import { contestWindow, reviewWindow } from "@/lib/leads/windows";
import type { LeadRecord, RescheduleView, SupplyLeadRecord } from "@/server/domain/lead-record";

export interface RecordFacts {
  readonly context: LeadActionContext;
  /** The open proposal to move the meeting, from whichever side made it. */
  readonly openProposal: RescheduleView | null;
  /** The viewer can contest the outcome now, with the time left. */
  readonly contestLabel: string | null;
  /** The coordinator can still ask for a review, with the time left. */
  readonly reviewLabel: string | null;
}

/**
 * Everything the action bar and the record's notices need that the stage alone does not say: whose proposal is open, whether the window to contest or to ask
 * for a review is open, whether the viewer sent the lead. Worked out from the record by the pure window helpers, so the buttons and the domain agree.
 */
export function recordFacts(record: LeadRecord, viewer: LeadViewer, now: Date, options: { readonly isCoordinator?: boolean } = {}): RecordFacts {
  const openProposal = record.reschedules.find((entry) => entry.status === "open") ?? null;
  const side = viewer === "client" ? "client" : "supply";
  const meeting = record.meeting;
  const contest = contestWindow({
    viewer,
    stage: record.stage,
    outcome: meeting?.outcome ?? null,
    recordedAt: meeting?.recordedAt ?? null,
    recordedByRole: meeting?.recordedByRole ?? null,
    contestedAt: meeting?.contestedAt ?? null,
    now,
  });
  const review = reviewWindow({
    stage: record.stage,
    decisionSource: record.decision?.source ?? null,
    decisionAt: record.decision?.at ?? null,
    alreadyAsked: record.reviewRequest !== null,
    now,
  });
  const isSource = (record as Partial<SupplyLeadRecord>).source !== undefined && "own" in (record as SupplyLeadRecord).source && (record as SupplyLeadRecord).source.own;
  const context: LeadActionContext = {
    isSource,
    isCoordinator: options.isCoordinator === true,
    openProposalBy: openProposal?.proposedBySide ?? null,
    canContest: contest.canContest,
    canAskReview: review.canAsk,
    reviewed: record.reviewed,
    overShare: record.overShare,
    proposal: openProposal !== null && openProposal.proposedBySide !== side ? { id: openProposal.id, times: openProposal.proposedTimes } : null,
    timeLeft: contest.canContest ? contest.label : review.canAsk ? review.label : "",
    contestedOutcome: meeting?.outcome ?? null,
    proposedTimes: record.proposedTimes,
    details: {
      prospectName: record.prospect.name,
      prospectTitle: record.prospect.title,
      prospectCompany: record.prospect.company,
      prospectDomain: record.prospect.domain,
      prospectLinkedinUrl: record.prospect.linkedinUrl,
      prospectEmail: record.prospect.email,
      prospectPhone: record.prospect.phone,
      prospectNotes: record.prospect.notes,
      bantBudget: record.bant.budget,
      bantAuthority: record.bant.authority,
      bantNeed: record.bant.need,
      bantTimeline: record.bant.timeline,
    },
  };
  return { context, openProposal, contestLabel: contest.canContest ? contest.label : null, reviewLabel: review.canAsk ? review.label : null };
}
