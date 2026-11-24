import type { Icon } from "@phosphor-icons/react";

type Props = {
  icon: Icon;
  title: string;
  /** One or two plain sentences: what is missing and what to do. */
  children?: React.ReactNode;
  /** One button, or nothing for a person who cannot change anything. */
  action?: React.ReactNode;
};

/** The calm empty state: an icon tile, a title, a sentence and at most one action. */
export function EmptyState({ icon: Glyph, title, children, action }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span aria-hidden className="grid size-11 place-items-center rounded-md bg-navy-05 text-ink-2">
        <Glyph size={21} />
      </span>
      <div className="flex max-w-[380px] flex-col gap-1">
        <h2 className="text-value font-semibold">{title}</h2>
        {children ? <p className="text-body text-ink-muted text-pretty">{children}</p> : null}
      </div>
      {action}
    </div>
  );
}
