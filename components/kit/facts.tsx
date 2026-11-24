import { cn } from "@/lib/utils";

/** Labelled facts as tonal tiles, two across. For qualification answers and record details. A tile holds text only. */
export function Facts({ items, className }: { items: readonly (readonly [label: string, value: React.ReactNode])[]; className?: string }) {
  return (
    <dl className={cn("grid gap-2.5 sm:grid-cols-2", className)}>
      {items.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-0.5 rounded-md bg-tonal px-3.5 py-3">
          <dt className="text-caption font-semibold text-ink-muted">{label}</dt>
          <dd className="text-row font-medium text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A note set off by a peach rule: free text someone wrote, quoted as given. */
export function Quote({ label = "Note", children }: { label?: string; children: React.ReactNode }) {
  return (
    <blockquote className="border-l-[3px] border-peach pl-3.5">
      <p className="text-caption font-semibold text-ink-muted">{label}</p>
      <p className="mt-0.5 text-row text-ink-2">{children}</p>
    </blockquote>
  );
}
