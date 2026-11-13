import type { Icon } from "@phosphor-icons/react";

type Props = {
  icon: Icon;
  title: string;
  /** One or two plain sentences: what is missing and what to do. */
  children?: React.ReactNode;
  /** A pill button, or nothing for a person who cannot change anything. */
  action?: React.ReactNode;
};

/** The calm empty state: an icon disc, a title, a sentence and at most one action. */
export function EmptyState({ icon: Glyph, title, children, action }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span aria-hidden className="grid size-12 place-items-center rounded-full bg-navy-05 text-ink-2">
        <Glyph size={22} />
      </span>
      <div className="flex max-w-[360px] flex-col gap-1">
        <h2 className="text-value font-semibold">{title}</h2>
        {children && <p className="text-body text-ink-2 text-pretty">{children}</p>}
      </div>
      {action}
    </div>
  );
}
