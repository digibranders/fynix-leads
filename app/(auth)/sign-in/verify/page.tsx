import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthPanel } from "@/components/auth/auth-frame";
import { hasChallengeCookie } from "@/lib/auth/session-cookie";
import { safeNextPath } from "@/lib/auth/next-path";
import { getSessionContext } from "@/server/auth";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Second step" };

/** The step after the password for a person with the second step on. With no challenge cookie there is nothing to answer, so the person starts again at the password. */
async function Guarded({ searchParams }: { searchParams: PageProps<"/sign-in/verify">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : undefined);
  if ((await getSessionContext()) !== null) redirect(next ?? "/welcome");
  if (!hasChallengeCookie(await cookies())) redirect("/sign-in");
  return <VerifyForm nextField={next === null ? null : <input type="hidden" name="next" value={next} />} />;
}

export default function VerifyPage({ searchParams }: PageProps<"/sign-in/verify">) {
  return (
    <AuthPanel title="Second step" lede="Enter the code from your authenticator app.">
      <Suspense fallback={null}>
        <Guarded searchParams={searchParams} />
      </Suspense>
    </AuthPanel>
  );
}
