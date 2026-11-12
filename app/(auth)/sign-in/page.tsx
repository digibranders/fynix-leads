import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthPanel } from "@/components/auth/auth-frame";
import { Notice } from "@/components/auth/notice";
import { INVITE_ACCEPTED_NOTICE } from "@/lib/domain/invite-messages";
import { PASSWORD_CHANGED_NOTICE, SESSION_ENDED_NOTICE, SIGNED_OUT_NOTICE } from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/next-path";
import { getSessionContext } from "@/server/auth";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

type SearchParams = PageProps<"/sign-in">["searchParams"];

/** A query value that is one plain string, or `undefined`. */
function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** The notice a query flag asks for. Display only: the query carries no data and grants nothing. At most one is shown. */
async function QueryNotice({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  // A person who is already signed in never sees the form.
  if ((await getSessionContext()) !== null) redirect(safeNextPath(one(params.next)) ?? "/welcome");
  if (one(params.reset) === "1") return <Notice tone="green" className="-mt-1">{PASSWORD_CHANGED_NOTICE}</Notice>;
  if (one(params.invite) === "accepted") return <Notice tone="green" className="-mt-1">{INVITE_ACCEPTED_NOTICE}</Notice>;
  if (one(params["signed-out"]) === "1") return <Notice tone="blue" className="-mt-1">{SIGNED_OUT_NOTICE}</Notice>;
  if (one(params.reason) === "ended") return <Notice tone="blue" className="-mt-1">{SESSION_ENDED_NOTICE}</Notice>;
  return null;
}

async function NextField({ searchParams }: { searchParams: SearchParams }) {
  const next = safeNextPath(one((await searchParams).next));
  return next === null ? null : <input type="hidden" name="next" value={next} />;
}

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <AuthPanel title="Sign in" lede="Use the email and password for your account.">
      <SignInForm
        notice={
          <Suspense fallback={null}>
            <QueryNotice searchParams={searchParams} />
          </Suspense>
        }
        nextField={
          <Suspense fallback={null}>
            <NextField searchParams={searchParams} />
          </Suspense>
        }
      />
    </AuthPanel>
  );
}
