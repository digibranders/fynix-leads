import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { PageHeader } from "@/components/kit/page-header";

/**
 * The frame of an "Add" page: a quiet way back, the title and one sentence, then the form at a comfortable reading width. The form brings
 * its own foot bar (`ActionForm` with `page`), so nothing here scrolls or sticks.
 */
export function FormPage({ title, description, backHref, backLabel, children }: { title: string; description: string; backHref: string; backLabel: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <Link href={backHref} className="inline-flex w-fit items-center gap-1.5 rounded-xs text-body font-medium text-ink-muted transition-colors hover:text-ink">
        <ArrowLeft aria-hidden size={15} />
        {backLabel}
      </Link>
      <PageHeader title={title} description={description} />
      {children}
    </div>
  );
}
