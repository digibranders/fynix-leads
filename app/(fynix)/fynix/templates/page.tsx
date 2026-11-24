import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TemplatesScreen } from "@/components/fynix/templates/templates-screen";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Email templates" };

async function Templates() {
  const view = await requireFynix();
  // Admin only, like the audit log. Staff get the not-found page.
  if (!view.canWrite) notFound();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Email templates" description="Every email the portal sends, grouped by who gets it." />
      <TemplatesScreen />
    </div>
  );
}

export default function TemplatesPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Templates />
    </Suspense>
  );
}
