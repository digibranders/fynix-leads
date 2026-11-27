"use client";

import { CircleNotch, WarningCircle } from "@phosphor-icons/react";
import { useActionState } from "react";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { When } from "@/components/kit/when";
import { Button } from "@/components/ui/button";
import { IDLE_FORM } from "@/lib/fynix/form-state";
import { replyInvitationAction } from "@/server/domain/team-actions";

/** One invitation as the client person reads it. Plain text only, so it can cross to the browser. */
export interface InvitationView {
  readonly meetingId: string;
  readonly meetingRef: string;
  readonly company: string;
  readonly campaignName: string;
  readonly startsAt: string;
  readonly minutes: number;
  readonly reply: "invited" | "accepted" | "released";
  readonly replyDueAt: string | null;
}

const NOTE: Record<InvitationView["reply"], string> = {
  invited: "Waiting for your reply",
  accepted: "You accepted",
  released: "Someone else accepted first",
};

function Invitation({ invitation }: { readonly invitation: InvitationView }) {
  const [state, action, pending] = useActionState(replyInvitationAction, IDLE_FORM);
  return (
    <li className="flex flex-col gap-2 py-3">
      <form action={action} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <input type="hidden" name="meetingId" value={invitation.meetingId} />
        <div className="min-w-0">
          <p className="text-row font-semibold">
            {invitation.company} <span className="font-normal text-ink-muted">{invitation.meetingRef}</span>
          </p>
          <p className="text-body text-ink-2">
            <When at={invitation.startsAt} />
            {`, ${invitation.minutes} minutes. ${invitation.campaignName}`}
          </p>
          <p className="text-label text-ink-muted">
            {NOTE[invitation.reply]}
            {invitation.reply === "invited" && invitation.replyDueAt !== null ? (
              <>
                {". Reply by "}
                <When at={invitation.replyDueAt} />
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {invitation.reply === "accepted" ? null : (
            <Button type="submit" name="reply" value="accepted" size="sm" disabled={pending}>
              {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : null}
              Accept
            </Button>
          )}
          {invitation.reply === "released" ? null : (
            <Button type="submit" name="reply" value="declined" size="sm" variant="secondary" disabled={pending}>
              Decline
            </Button>
          )}
        </div>
      </form>
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-label font-semibold text-red-text">
          <WarningCircle aria-hidden size={16} weight="fill" className="mt-px shrink-0" />
          {state.message ?? "That could not be saved. Try again."}
        </p>
      ) : null}
    </li>
  );
}

/** The meetings a client person is invited to. The first person to accept takes the meeting; everyone else is let go and told so here. Nothing renders when there are none. */
export function InvitationsPanel({ invitations }: { readonly invitations: readonly InvitationView[] }) {
  if (invitations.length === 0) return null;
  return (
    <Panel aria-label="Meeting invitations">
      <PanelHeader title="Meeting invitations" count={invitations.length} />
      <ul className="divide-y divide-line px-5 pb-2">
        {invitations.map((invitation) => (
          <Invitation key={invitation.meetingId} invitation={invitation} />
        ))}
      </ul>
    </Panel>
  );
}
