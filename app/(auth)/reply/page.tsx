import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthPanel } from "@/components/auth/auth-frame";
import { Notice } from "@/components/auth/notice";
import { Skeleton } from "@/components/ui/skeleton";
import { retryMessage } from "@/lib/auth/messages";
import { loadInvitationLink } from "@/server/domain/page-data";
import { ReplyForm } from "./reply-form";

export const metadata: Metadata = { title: "Meeting invitation" };

const UNAVAILABLE = {
  invalid: "This link is not valid. Open the link in your invitation email again.",
  closed: "This meeting is no longer waiting for a reply.",
  expired: "The time to reply to this invitation has passed. A new time will be found.",
} as const;

/** Everything that depends on the request: the token, the headers and the invitation. The frame around it holds nothing private. */
async function ReplyContent({ searchParams }: { searchParams: PageProps<"/reply">["searchParams"] }) {
  // The invitation is read against the clock and the visitor's address: render per request, never at build time.
  await connection();
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : undefined;
  const view = await loadInvitationLink(value);
  if (view.status === "rate-limited") {
    return (
      <AuthPanel title="Meeting invitation">
        <div className="mt-5"><Notice tone="amber">{retryMessage(view.retryAfterSeconds)}</Notice></div>
      </AuthPanel>
    );
  }
  if (view.status !== "open") {
    return (
      <AuthPanel title="Meeting invitation">
        <div className="mt-5"><Notice tone="red">{UNAVAILABLE[view.status]}</Notice></div>
      </AuthPanel>
    );
  }
  const { details } = view;
  return (
    <AuthPanel title="Meeting invitation" lede={`Hello ${details.personName}. A meeting is waiting for your reply.`} wide>
      <ReplyForm
        token={value ?? ""}
        details={{
          company: details.company,
          campaignName: details.campaignName,
          startsAt: details.startsAt.toISOString(),
          minutes: details.minutes,
          timeZone: details.timeZone,
          replyDueAt: details.replyDueAt?.toISOString() ?? null,
          personName: details.personName,
          reply: details.reply,
        }}
      />
    </AuthPanel>
  );
}

export default function ReplyPage({ searchParams }: PageProps<"/reply">) {
  return (
    <Suspense
      fallback={
        <AuthPanel wide>
          <Skeleton className="h-64 w-full" />
        </AuthPanel>
      }
    >
      <ReplyContent searchParams={searchParams} />
    </Suspense>
  );
}
