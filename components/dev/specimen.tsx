import { cn } from "@/lib/utils";

/** A numbered-free section of the design system page: a plain h2 and its content. */
export function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-6 border-t pt-8">
      <h2 id={`${id}-heading`} className="text-base font-semibold">
        {title}
      </h2>
      {note && <p className="mt-1 max-w-prose text-sm text-muted-foreground">{note}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** One component in one state, with its label underneath. */
export function Specimen({
  caption,
  children,
  className,
}: {
  caption: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("flex h-full flex-col items-start gap-2", className)}>
      <div className="max-w-full">{children}</div>
      <figcaption className="mt-auto text-xs text-muted-foreground">{caption}</figcaption>
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
      <h3 className="text-sm font-medium">{title}</h3>
      <div className={cn("flex flex-wrap items-start gap-x-6 gap-y-4", className)}>{children}</div>
    </div>
  );
}
