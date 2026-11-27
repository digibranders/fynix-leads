"use client";

import { CircleNotch } from "@phosphor-icons/react";
import { useActionState } from "react";
import { Notice } from "@/components/auth/notice";
import { When } from "@/components/kit/when";
import { Button } from "@/components/ui/button";
import { INVITATION_LINK_IDLE } from "@/lib/domain/invitation-link-state";
import { answerInvitationLinkAction } from "@/server/domain/actions";

export interface ReplyDetails {
  readonly company: string;
  readonly campaignName: string;
  readonly startsAt: string;
  readonly minutes: number;
  readonly timeZone: string;
  readonly replyDueAt: string | null;
  readonly personName: string;
  readonly reply: "invited" | "accepted" | "declined" | "released";
}

const WHEN_NOTE = (zone: string) => `Times are shown in your time zone. The client's time zone is ${zone}.`;

/** The meeting and the two answers. The token travels in a hidden field and is never printed. */
export function ReplyForm({ token, details }: { readonly token: string; readonly details: ReplyDetails }) {
  const [state, action, pending] = useActionState(answerInvitationLinkAction, INVITATION_LINK_IDLE);
  const answered = state.status === "answered" ? state : null;
  const current = answered?.reply ?? (details.reply === "accepted" ? "accepted" : details.reply === "declined" ? "declined" : null);
  return (
    <form action={action} className="mt-5 flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-0.5 rounded-md bg-tonal px-4 py-3.5">
        <p className="text-row font-semibold">{`Meeting with ${details.company}`}</p>
        <p className="text-body text-ink-2">
          <When at={details.startsAt} />
          {`, ${details.minutes} minutes`}
        </p>
        <p className="text-label text-ink-muted">{`Campaign: ${details.campaignName}`}</p>
        <p className="text-caption text-ink-muted">{WHEN_NOTE(details.timeZone)}</p>
      </div>
      {details.reply === "released" && answered === null ? <Notice tone="blue">Someone else on your team has already accepted. You can still accept to be added.</Notice> : null}
      {answered?.confirmed ? <Notice tone="green">Thank you. The meeting is confirmed and the others are told.</Notice> : null}
      {answered !== null && !answered.confirmed && answered.reply === "accepted" ? <Notice tone="green">Thank you. You are going to this meeting.</Notice> : null}
      {answered?.reply === "declined" ? <Notice tone="blue">{answered.needsNewTime ? "Thank you. Nobody on your team is left, so a new time will be found." : "Thank you. We have noted that you cannot take this meeting."}</Notice> : null}
      {current === "accepted" && answered === null ? <Notice tone="green">You accepted this meeting.</Notice> : null}
      {current === "declined" && answered === null ? <Notice tone="blue">You declined this meeting.</Notice> : null}
      {state.status === "refused" ? <Notice tone="red">{state.message}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        {current === "accepted" ? null : (
          <Button type="submit" name="reply" value="accepted" disabled={pending}>
            {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : null}
            Accept
          </Button>
        )}
        {current === "declined" || details.reply === "released" ? null : (
          <Button type="submit" name="reply" value="declined" variant="secondary" disabled={pending}>
            Decline
          </Button>
        )}
      </div>
      {details.replyDueAt === null ? null : (
        <p className="text-caption text-ink-muted">
          {"Reply by "}
          <When at={details.replyDueAt} />
        </p>
      )}
    </form>
  );
}
