import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { ShellSkeleton } from "@/components/shell/shell-skeleton";
import { requireClient } from "@/server/client/session";
import { getDatabase } from "@/server/db/client";
import { clientQueueCount } from "@/lib/leads/decision-queue";
import { listClientLeads } from "@/server/domain/leads";
import { loadShellCounts } from "@/server/domain/notices";

export const metadata: Metadata = {
  title: { default: "Client portal", template: "%s | Client portal" },
  robots: { index: false, follow: false },
};

async function ClientShellLoader({ children }: { children: React.ReactNode }) {
  const view = await requireClient();
  // The count beside "Availability" adds both queues of that screen: leads waiting for a time and leads waiting for an answer.
  const db = getDatabase("leads_client").db;
  const [leads, shell] = await Promise.all([listClientLeads(db, view.actor), loadShellCounts(db, view.actor)]);
  const waiting = clientQueueCount(leads);
  return (
    <AppShell
      portal="client"
      userName={view.name}
      roleLabel={view.canWrite ? "Client manager" : "Client member"}
      counts={{ respond: waiting, messages: shell.messages }}
      unreadNotices={shell.notices}
    >
      {children}
    </AppShell>
  );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <ClientShellLoader>{children}</ClientShellLoader>
    </Suspense>
  );
}
