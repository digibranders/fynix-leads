import Link from "next/link";
import { Check, Clock, X } from "@phosphor-icons/react/dist/ssr";
import { FormSheet } from "@/components/fynix/forms/form-sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { availableActions, type LeadViewer } from "@/lib/leads/lead-actions";
import { DecideLeadForm, OverturnRejectionForm, ProposeTimesForm, RecordOutcomeForm, RejectLeadForm } from "./lead-forms";

/**
 * The buttons a lead record offers, only the ones that are valid for the viewer and the stage (`availableActions`). Accept and reject open a sheet that
 * states the consequence and asks for the note before the last button: that is the confirm step. Nothing renders when nothing is valid.
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
}) {
  const passed = meetingTime !== null && new Date(meetingTime).getTime() <= now.getTime();
  const actions = availableActions({ viewer, stage, meetingPassed: passed }).filter((action) => action !== "record_outcome" || meetingId !== null);
  if (actions.length === 0) return null;
  const side = viewer === "fynix" ? "fynix" : "tenant";
  const who = prospectName;

  return (
    <div className="flex flex-wrap items-center gap-2 bg-navy-03 px-6 py-4" role="group" aria-label="Actions">
      {actions.includes("pick_time") && availabilityHref !== undefined ? (
        <Link href={availabilityHref} className={buttonVariants({ variant: "default" })}>
          <Clock aria-hidden weight="bold" />
          Pick a time
        </Link>
      ) : null}
      {actions.includes("propose_times") ? (
        <FormSheet trigger={<Button type="button" variant="secondary">Propose other times</Button>} title="Propose other times" description={`Offer one to three times for ${who}.`}>
          <ProposeTimesForm leadId={leadId} />
        </FormSheet>
      ) : null}
      {actions.includes("record_outcome") && meetingId !== null ? (
        <FormSheet trigger={<Button type="button" variant="default">Record outcome</Button>} title="Record the outcome" description={`How did the meeting with ${who} go?`}>
          <RecordOutcomeForm meetingId={meetingId} side={side} />
        </FormSheet>
      ) : null}
      {actions.includes("decide") ? (
        <FormSheet trigger={<Button type="button" variant="default"><Check aria-hidden weight="bold" />Accept lead</Button>} title="Accept this lead" description={`Accept ${who} and count it as one.`}>
          <DecideLeadForm leadId={leadId} decision="accept" />
        </FormSheet>
      ) : null}
      {actions.includes("overturn") ? (
        <FormSheet trigger={<Button type="button" variant="default"><Check aria-hidden weight="bold" />Change to accepted</Button>} title="Change to accepted" description={`Overturn the client's rejection of ${who}.`}>
          <OverturnRejectionForm leadId={leadId} />
        </FormSheet>
      ) : null}
      <span className="flex-1" />
      {actions.includes("decide") ? (
        <FormSheet trigger={<Button type="button" variant="ghost-destructive"><X aria-hidden weight="bold" />Reject lead</Button>} title="Reject this lead" description={`Reject ${who} and count it as zero.`}>
          <DecideLeadForm leadId={leadId} decision="reject" />
        </FormSheet>
      ) : null}
      {actions.includes("reject") ? (
        <FormSheet trigger={<Button type="button" variant="ghost-destructive"><X aria-hidden weight="bold" />Reject lead</Button>} title="Reject this lead" description={`Reject ${who} before the meeting.`}>
          <RejectLeadForm leadId={leadId} booked={stage === "scheduled"} />
        </FormSheet>
      ) : null}
    </div>
  );
}
