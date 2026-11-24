import { cn } from "@/lib/utils";

/**
 * The title row on the canvas: no bar, no border. One title, one plain sentence of facts from the data, and the page's actions on
 * the right (at most one primary). Actions wrap under the title on a phone.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pb-1", className)}>
      <div className="min-w-0 basis-full md:basis-0 md:flex-1">
        <h1 className="text-title font-semibold tracking-title text-balance text-ink">{title}</h1>
        {description ? <p className="mt-0.5 text-body text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
