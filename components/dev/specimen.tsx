import { cn } from "@/lib/utils";

/** One module of the design system page: a white panel with a plain title and its content. */
export function Section({
  id,
  title,
  note,
  children,
  className,
}: {
  id: string;
  title: string;
  note?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className={cn("scroll-mt-6 rounded-lg bg-surface p-6 shadow-raised", className)}
    >
      <h2 id={`${id}-heading`} className="text-value font-semibold">
        {title}
      </h2>
      {note && <p className="mt-1 max-w-prose text-[13px] text-ink-muted">{note}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** One component in one state, with its label underneath. */
export function Specimen({
  caption,
  children,
  fill = false,
  className,
}: {
  caption: string;
  children: React.ReactNode;
  /** Stretch the specimen to the width of its cell. */
  fill?: boolean;
  className?: string;
}) {
  return (
    <figure className={cn("flex h-full flex-col items-start gap-2", fill && "w-full", className)}>
      <div className={cn("max-w-full", fill && "w-full")}>{children}</div>
      <figcaption className="mt-auto text-xs text-ink-muted">{caption}</figcaption>
    </figure>
  );
}

/** The labelled block that groups specimens, for example one button variant. */
export function Group({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-ink-2">{title}</h3>
      <div className={cn("flex flex-wrap items-start gap-x-6 gap-y-4", className)}>{children}</div>
    </div>
  );
}
