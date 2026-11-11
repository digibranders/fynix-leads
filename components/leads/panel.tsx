import { cn } from "@/lib/utils";

type Props = {
  /** Id of the heading, so the panel is a named landmark. */
  id: string;
  title: string;
  /** Muted text after the title, for example a count or who the thread is between. */
  meta?: string;
  className?: string;
  /** Height of the title row. The activity panel is a little shorter than the messages panel. */
  headClassName?: string;
  children: React.ReactNode;
};

/** A white raised panel with a titled header row. The `@container` lets the content adapt to the panel width, not the window. */
export function Panel({ id, title, meta, className, headClassName, children }: Props) {
  return (
    <section
      aria-labelledby={id}
      className={cn("@container flex min-w-0 flex-col overflow-hidden rounded-lg bg-surface shadow-raised", className)}
    >
      <div className={cn("flex min-h-14 shrink-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 py-2 pr-5 pl-6", headClassName)}>
        <h2 id={id} className="text-value font-semibold tracking-[-0.005em]">
          {title}
        </h2>
        {meta && <span className="text-[13px] text-ink-muted">{meta}</span>}
      </div>
      {children}
    </section>
  );
}
