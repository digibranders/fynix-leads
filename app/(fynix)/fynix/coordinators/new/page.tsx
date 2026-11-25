import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FormPage } from "@/components/fynix/forms/form-page";
import { TermsNotice } from "@/components/fynix/forms/terms-notice";
import { AddCoordinatorForm } from "@/components/fynix/forms/coordinator-forms";
import { PageSkeleton } from "@/components/kit/skeletons";
import { termsMissing } from "@/server/fynix/terms";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Add coordinator" };

async function NewCoordinator() {
  const view = await requireFynix();
  const missing = await termsMissing(view, "agency");
  if (!view.canWrite) redirect("/fynix/coordinators");
  return (
    <FormPage
      title="Add coordinator"
      description="A coordinator is one person who works with Fynix directly. They get an email invite to sign in."
      backHref="/fynix/coordinators"
      backLabel="Coordinators"
    >
      <TermsNotice missing={missing} side="coordinators and agencies" />
      <AddCoordinatorForm page={{ cancelHref: "/fynix/coordinators" }} />
    </FormPage>
  );
}

export default function NewCoordinatorPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <NewCoordinator />
    </Suspense>
  );
}
