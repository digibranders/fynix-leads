import { Buildings, Handshake, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthPanel } from "@/components/auth/auth-frame";
import { Skeleton } from "@/components/ui/skeleton";
import { KIND_LABEL, initialsOf } from "@/lib/auth/display";
import { requireSessionContext } from "@/server/auth/guard";
import { SignOutForm } from "./sign-out-form";

export const metadata: Metadata = { title: "Signed in" };

const KIND_ICON = { fynix: ShieldCheck, client: Buildings, agency: Handshake } as const;

/** Until phase 1E builds the role-shaped shells for clients and agencies: the person's name, one word for their kind of organisation, and a way out. Nothing about any organisation, campaign or other party. */
async function Welcome() {
  // Request time from the first line: the session read below must never run while the shell is prerendered at build.
  await connection();
  const context = await requireSessionContext();
  // Fynix members have their own screens (phase 1D). Clients and agencies stay here until phase 1E builds theirs.
  if (context.kind === "fynix") redirect("/fynix");
  const KindIcon = KIND_ICON[context.kind];
  return (
    <div className="w-full max-w-[400px] rounded-lg bg-surface px-5 pt-7 pb-6 shadow-raised sm:px-7 sm:pt-8 sm:pb-7">
      <h1 className="sr-only">Signed in</h1>
      <div className="flex flex-col items-center gap-3 text-center">
        <span aria-hidden className="grid size-14 place-items-center rounded-full bg-peach text-lead font-semibold text-navy">
          {initialsOf(context.name)}
        </span>
        <p className="mt-0.5 text-title font-semibold tracking-title break-words">{context.name}</p>
        <span className="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-navy-07 pr-3 pl-2.5 text-table font-semibold">
          <KindIcon aria-hidden size={17} />
          {KIND_LABEL[context.kind]}
        </span>
        <p className="text-body text-ink-2">You are signed in.</p>
        <SignOutForm />
      </div>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense
      fallback={
        <AuthPanel>
          <Skeleton className="h-40 w-full" />
        </AuthPanel>
      }
    >
      <Welcome />
    </Suspense>
  );
}
