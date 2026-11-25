import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FormPage } from "@/components/fynix/forms/form-page";
import { AddSupplierForm } from "@/components/fynix/forms/supplier-forms";
import { PageSkeleton } from "@/components/kit/skeletons";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Add coordinator" };

async function NewSupplier() {
  const view = await requireFynix();
  if (!view.canWrite) redirect("/fynix/suppliers");
  return (
    <FormPage
      title="Add coordinator"
      description="A coordinator is an agency that works with Fynix directly. Add it, and invite its first person if you have one."
      backHref="/fynix/suppliers"
      backLabel="Coordinators"
    >
      <AddSupplierForm page={{ cancelHref: "/fynix/suppliers" }} />
    </FormPage>
  );
}

export default function NewSupplierPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <NewSupplier />
    </Suspense>
  );
}
