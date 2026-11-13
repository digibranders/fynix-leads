/** The title row on the canvas: no bar, no border. Facts from the data only. `actions` sit to the right and wrap below the title on a phone. */
export function FynixPageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 pb-4">
      <div className="min-w-0 basis-full md:basis-0 md:flex-1">
        <h1 className="text-title font-semibold tracking-title text-balance text-ink">{title}</h1>
        {subtitle && <p className="mt-[3px] text-body text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </header>
  );
}
