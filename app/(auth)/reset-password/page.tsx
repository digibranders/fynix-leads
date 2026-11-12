import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthPanel } from "@/components/auth/auth-frame";
import { LinkNotValid } from "@/components/auth/link-not-valid";
import { Skeleton } from "@/components/ui/skeleton";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

/** Reads the token on the server, from the query only. No token, or an empty one, is the dead link state. */
async function ResetContent({ searchParams }: { searchParams: PageProps<"/reset-password">["searchParams"] }) {
  const { token } = await searchParams;
  if (typeof token !== "string" || token.length === 0) {
    return (
      <AuthPanel title="Link not valid">
        <LinkNotValid />
      </AuthPanel>
    );
  }
  return <ResetPasswordForm token={token} />;
}

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <Suspense
      fallback={
        <AuthPanel title="Choose a new password">
          <Skeleton className="mt-[22px] h-40 w-full" />
        </AuthPanel>
      }
    >
      <ResetContent searchParams={searchParams} />
    </Suspense>
  );
}
