import { cn } from "@/lib/utils";

/** A white surface: 14px corners, a ring shadow, no outline. `@container` lets the content adapt to the panel, not the window. */
export function Panel({ className, children, ...rest }: React.ComponentProps<"section">) {
  return (
    <section {...rest} className={cn("@container min-w-0 overflow-hidden rounded-lg bg-surface shadow-raised", className)}>
      {children}
    </section>
  );
}

/** The title row of a panel: a heading, an optional count chip, and one quiet action on the right. */
export function PanelHeader({
  title,
  count,
  action,
  className,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-5 pt-4 pb-2", className)}>
      <h2 className="flex items-center gap-2 text-section font-semibold tracking-[-0.01em]">
        {title}
        {count !== undefined ? (
          <span className="rounded-xs bg-selected px-1.5 text-xs leading-5 font-semibold text-peach-deep">{count}</span>
        ) : null}
      </h2>
      {action}
    </div>
  );
}

/** A soft tonal block inside a panel or a drawer. A tonal block never contains another tonal block. */
export function Tonal({ className, children, ...rest }: React.ComponentProps<"section">) {
  return (
    <section {...rest} className={cn("rounded-md bg-tonal p-4", className)}>
      {children}
    </section>
  );
}
