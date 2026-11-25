import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AddClientForm } from "@/components/fynix/forms/client-forms";
import { FormPage } from "@/components/fynix/forms/form-page";
import { PageSkeleton } from "@/components/kit/skeletons";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Add client" };

async function NewClient() {
  const view = await requireFynix();
  if (!view.canWrite) redirect("/fynix/clients");
  return (
    <FormPage title="Add client" description="A client is the company that buys the meetings." backHref="/fynix/clients" backLabel="Clients">
      <AddClientForm page={{ cancelHref: "/fynix/clients" }} />
    </FormPage>
  );
}

export default function NewClientPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <NewClient />
    </Suspense>
  );
}
