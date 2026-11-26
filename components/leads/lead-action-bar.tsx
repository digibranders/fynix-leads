import Link from "next/link";
import { Check, Clock, X } from "@phosphor-icons/react/dist/ssr";
import { FormSheet } from "@/components/fynix/forms/form-sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import type { CalendarPersonLike } from "@/lib/calendar/layout";
import { availableActions, type LeadActionFacts, type LeadViewer } from "@/lib/leads/lead-actions";
import { AnswerForClientForm, ClearOverShareForm, CorrectLeadForm, DecideContestForm, MarkLostForm, MarkReviewedForm, type CorrectableLead } from "./fynix-lead-forms";
import { DecideLeadForm, OverturnRejectionForm, ProposeTimesForm, RecordOutcomeForm, RejectLeadForm } from "./lead-forms";
import { AskReviewForm, BookNewTimeForm, ContestOutcomeForm, PickNewTimeForm, PostponeForm, WithdrawLeadForm } from "./phase4-forms";

/** What the forms of the newer actions need: an open proposal to pick from, the time left of a window, the lead's details for Fynix's correction. */
export interface LeadActionContext extends LeadActionFacts {
  /** The proposal the other side made, with its id and times. */
  readonly proposal?: { readonly id: string; readonly times: readonly string[] } | null;
  /** "36h left" for the contest or the review window, whichever applies. */
  readonly timeLeft?: string;
  /** The outcome in dispute, for Fynix's decision. */
  readonly contestedOutcome?: string | null;
  readonly proposedTimes?: readonly string[];
  readonly details?: CorrectableLead;
  /** The client team with their hours and busy time, for booking a new time. */
  readonly people?: readonly CalendarPersonLike[];
}

/**
 * The buttons a lead record offers, only the ones that are valid for the viewer and the stage (`availableActions`). Accept and reject open a sheet that
 * states the consequence and asks for the note before the last button: that is the confirm step. Nothing renders when nothing is valid.
 * Withdraw and the Fynix actions open a sheet too, and every one that changes a lead asks for its note there.
 */
export function LeadActionBar({
  viewer,
  stage,
  leadId,
  prospectName,
  meetingId,
  meetingTime,
  now,
  availabilityHref,
  context = {},
}: {
  readonly viewer: LeadViewer;
  readonly stage: string;
  readonly leadId: string;
  readonly prospectName: string;
  readonly meetingId: string | null;
  readonly meetingTime: Date | string | null;
  readonly now: Date;
  /** Where a client picks a time: the Availability screen with this lead selected. */
  readonly availabilityHref?: string;
  readonly context?: LeadActionContext;
}) {
  const passed = meetingTime !== null && new Date(meetingTime).getTime() <= now.getTime();
  const needsMeeting = new Set(["record_outcome", "postpone", "contest"]);
  const actions = availableActions({ viewer, stage, meetingPassed: passed, ...context }).filter((action) => !needsMeeting.has(action) || meetingId !== null);
  if (actions.length === 0) return null;
  const side = viewer === "fynix" ? "fynix" : "tenant";
  const who = prospectName;
  const left = context.timeLeft ?? "";
  const has = (action: (typeof actions)[number]) => actions.includes(action);

  return (
    <div className="flex flex-wrap items-center gap-2 bg-navy-03 px-6 py-4" role="group" aria-label="Actions">
      {has("pick_time") && availabilityHref !== undefined ? (
        <Link href={availabilityHref} className={buttonVariants({ variant: "default" })}>
          <Clock aria-hidden weight="bold" />
          Pick a time
        </Link>
      ) : null}
      {has("pick_new_time") && context.proposal != null ? (
        <FormSheet trigger={<Button type="button" variant="default"><Clock aria-hidden weight="bold" />Pick a new time</Button>} title="Pick a new time" description={`New times were proposed for the meeting with ${who}.`}>
          <PickNewTimeForm rescheduleId={context.proposal.id} times={context.proposal.times} />
        </FormSheet>
      ) : null}
      {has("propose_times") ? (
        <FormSheet trigger={<Button type="button" variant="secondary">Propose other times</Button>} title="Propose other times" description={`Offer one to three times for ${who}.`}>
          <ProposeTimesForm leadId={leadId} />
        </FormSheet>
      ) : null}
      {has("record_outcome") && meetingId !== null ? (
        <FormSheet trigger={<Button type="button" variant="default">Record outcome</Button>} title="Record the outcome" description={`How did the meeting with ${who} go?`}>
          <RecordOutcomeForm meetingId={meetingId} side={side} />
        </FormSheet>
      ) : null}
      {has("decide") ? (
        <FormSheet trigger={<Button type="button" variant="default"><Check aria-hidden weight="bold" />Accept lead</Button>} title="Accept this lead" description={`Accept ${who} and count it as one.`}>
          <DecideLeadForm leadId={leadId} decision="accept" />
        </FormSheet>
      ) : null}
      {has("overturn") ? (
        <FormSheet trigger={<Button type="button" variant="default"><Check aria-hidden weight="bold" />Change to accepted</Button>} title="Change to accepted" description={`Overturn the client's rejection of ${who}.`}>
          <OverturnRejectionForm leadId={leadId} />
        </FormSheet>
      ) : null}
      {has("decide_contest") ? (
        <FormSheet trigger={<Button type="button" variant="default">Decide the contest</Button>} title="Decide the contest" description={`The outcome of the meeting with ${who} is contested.`}>
          <DecideContestForm leadId={leadId} contestedOutcome={context.contestedOutcome ?? "held"} />
        </FormSheet>
      ) : null}
      {has("postpone") && meetingId !== null ? (
        <FormSheet trigger={<Button type="button" variant="secondary">Propose new times</Button>} title="Propose new times" description={`Move the meeting with ${who}.`}>
          <PostponeForm meetingId={meetingId} />
        </FormSheet>
      ) : null}
      {has("book_new_time") && context.people !== undefined ? (
        <FormSheet trigger={<Button type="button" variant="default"><Clock aria-hidden weight="bold" />Book a new time</Button>} title="Book a new time" description={`Move the meeting with ${who}.`}>
          <BookNewTimeForm leadId={leadId} people={context.people} />
        </FormSheet>
      ) : null}
      {has("contest") && meetingId !== null ? (
        <FormSheet trigger={<Button type="button" variant="secondary">Contest outcome</Button>} title="Contest the outcome" description={`The other side recorded how the meeting with ${who} went.`}>
          <ContestOutcomeForm meetingId={meetingId} timeLeft={left} />
        </FormSheet>
      ) : null}
      {has("ask_review") ? (
        <FormSheet trigger={<Button type="button" variant="secondary">Ask Fynix to review</Button>} title="Ask Fynix to review" description={`The client rejected ${who} after the meeting.`}>
          <AskReviewForm leadId={leadId} timeLeft={left} />
        </FormSheet>
      ) : null}
      {has("mark_reviewed") ? (
        <FormSheet trigger={<Button type="button" variant="secondary">Mark reviewed</Button>} title="Mark as reviewed" description={`Leave the rejection of ${who} as it is.`}>
          <MarkReviewedForm leadId={leadId} />
        </FormSheet>
      ) : null}
      {has("correct") && context.details !== undefined ? (
        <FormSheet trigger={<Button type="button" variant="secondary">Correct details</Button>} title="Correct details" description={`Fix what the lead says about ${who}.`}>
          <CorrectLeadForm leadId={leadId} lead={context.details} />
        </FormSheet>
      ) : null}
      {has("answer_for_client") ? (
        <FormSheet trigger={<Button type="button" variant="secondary">Answer for the client</Button>} title="Answer for the client" description={`Fynix answers for the client on ${who}.`}>
          <AnswerForClientForm leadId={leadId} stage={stage} proposedTimes={context.proposedTimes ?? []} />
        </FormSheet>
      ) : null}
      {has("clear_over_share") ? (
        <FormSheet trigger={<Button type="button" variant="secondary">Clear over-share flag</Button>} title="Clear the over-share flag" description={`${who} went beyond a share.`}>
          <ClearOverShareForm leadId={leadId} />
        </FormSheet>
      ) : null}
      <span className="flex-1" />
      {has("decide") ? (
        <FormSheet trigger={<Button type="button" variant="ghost-destructive"><X aria-hidden weight="bold" />Reject lead</Button>} title="Reject this lead" description={`Reject ${who} and count it as zero.`}>
          <DecideLeadForm leadId={leadId} decision="reject" />
        </FormSheet>
      ) : null}
      {has("reject") ? (
        <FormSheet trigger={<Button type="button" variant="ghost-destructive"><X aria-hidden weight="bold" />Reject lead</Button>} title="Reject this lead" description={`Reject ${who} before the meeting.`}>
          <RejectLeadForm leadId={leadId} booked={stage === "scheduled"} />
        </FormSheet>
      ) : null}
      {has("withdraw") ? (
        <FormSheet trigger={<Button type="button" variant="ghost-destructive">Withdraw lead</Button>} title="Withdraw this lead" description={`Take ${who} back before the meeting.`}>
          <WithdrawLeadForm leadId={leadId} booked={stage === "scheduled"} />
        </FormSheet>
      ) : null}
      {has("mark_lost") ? (
        <FormSheet trigger={<Button type="button" variant="ghost-destructive">Mark lost</Button>} title="Mark this lead lost" description={`Close ${who} at zero.`}>
          <MarkLostForm leadId={leadId} />
        </FormSheet>
      ) : null}
    </div>
  );
}
