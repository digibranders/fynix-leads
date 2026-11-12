import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthPanel } from "@/components/auth/auth-frame";
import { InviteUnavailable } from "@/components/auth/invite-unavailable";
import { Skeleton } from "@/components/ui/skeleton";
import { retryMessage } from "@/lib/auth/messages";
import { INVITE_INVALID, unavailableMessage } from "@/lib/domain/invite-messages";
import { INVITE_UNAVAILABLE_TITLE } from "@/lib/domain/invite-page-copy";
import { loadInvitePage } from "@/server/domain/page-data";
import { AcceptInviteForm } from "./accept-invite-form";

export const metadata: Metadata = { title: "Accept your invite" };

function Unavailable({ reason, message }: { reason: React.ComponentProps<typeof InviteUnavailable>["reason"]; message: string }) {
  return (
    <AuthPanel title={INVITE_UNAVAILABLE_TITLE}>
      <InviteUnavailable reason={reason} message={message} />
    </AuthPanel>
  );
}

/** Everything that depends on the request: the token, the headers and the invite. The frame around it holds nothing private. */
async function InviteContent({ searchParams }: { searchParams: PageProps<"/accept-invite">["searchParams"] }) {
  // The invite is read against the clock and the visitor's address: render per request, never at build time.
  await connection();
  const { token } = await searchParams;
  const inviteToken = typeof token === "string" ? token : undefined;
  const preview = await loadInvitePage(inviteToken);
  switch (preview.status) {
    case "pending":
      // Fynix withdrew the terms after inviting: the person cannot accept nothing.
      if (preview.terms === null) return <Unavailable reason="invalid" message={INVITE_INVALID} />;
      return (
        <AcceptInviteForm
          token={inviteToken ?? ""}
          name={preview.name}
          email={preview.email}
          party={preview.party}
          terms={{ id: preview.terms.id, title: preview.terms.title, version: preview.terms.version, body: preview.terms.body, placeholder: preview.terms.placeholder }}
        />
      );
    case "rate-limited":
      return <Unavailable reason="rate-limited" message={retryMessage(preview.retryAfterSeconds)} />;
    default:
      return <Unavailable reason={preview.status} message={unavailableMessage(preview.status)} />;
  }
}

export default function AcceptInvitePage({ searchParams }: PageProps<"/accept-invite">) {
  return (
    <Suspense
      fallback={
        <AuthPanel wide>
          <Skeleton className="h-64 w-full" />
        </AuthPanel>
      }
    >
      <InviteContent searchParams={searchParams} />
    </Suspense>
  );
}
