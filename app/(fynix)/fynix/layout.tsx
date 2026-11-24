import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { ShellSkeleton } from "@/components/shell/shell-skeleton";
import { getDomain } from "@/server/domain";
import { getDatabase } from "@/server/db/client";
import { loadShellCounts } from "@/server/domain/notices";
import { listRejections } from "@/server/domain/rejection-overview";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: { default: "Fynix", template: "%s | Fynix Leads" }, robots: { index: false, follow: false } };

async function FynixShellLoader({ children }: { children: React.ReactNode }) {
  const view = await requireFynix();
  // The count beside "Rejections" is the same read the rejections page makes, so the two can never disagree.
  const [rejections, shell] = await Promise.all([
    listRejections(getDomain(), view.actor),
    loadShellCounts(getDatabase("leads_fynix").db, { userId: view.actor.userId, orgKind: "fynix", role: view.canWrite ? "manager" : "member", displayName: view.name }),
  ]);
  return (
    <AppShell portal="fynix" userName={view.name} roleLabel={view.canWrite ? "Fynix admin" : "Fynix staff"} counts={{ rejections: rejections.length, messages: shell.messages }} unreadNotices={shell.notices}>
      {children}
    </AppShell>
  );
}

/**
 * The layout holds nothing private. The shell reads the session, so it sits in its own `<Suspense>` boundary: a client navigation
 * does not run a layout again, which is why every page asks for the session too.
 */
export default function FynixLayout({ children }: LayoutProps<"/fynix">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <FynixShellLoader>{children}</FynixShellLoader>
    </Suspense>
  );
}
