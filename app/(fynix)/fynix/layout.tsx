import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { ShellSkeleton } from "@/components/shell/shell-skeleton";
import { getDomain } from "@/server/domain";
import { listOpenDisputes } from "@/server/domain/dispute-overview";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: { default: "Fynix", template: "%s | Fynix Leads" }, robots: { index: false, follow: false } };

async function FynixShellLoader({ children }: { children: React.ReactNode }) {
  const view = await requireFynix();
  // The count beside "Disputes" is the same read the disputes page makes, so the two can never disagree.
  const disputes = await listOpenDisputes(getDomain(), view.actor);
  return (
    <AppShell portal="fynix" userName={view.name} roleLabel={view.canWrite ? "Fynix admin" : "Fynix staff"} counts={{ disputes: disputes.length }}>
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
