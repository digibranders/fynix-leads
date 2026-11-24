import type { Icon } from "@phosphor-icons/react";

type Props = {
  icon: Icon;
  title: string;
  /** What happened and what to do next, in one or two plain sentences. */
  children: React.ReactNode;
  /** Pill links or buttons. */
  actions: React.ReactNode;
};

/** A calm full-page message on the canvas, for the pages that sit outside the app shell (404 and errors). */
export function MessagePage({ icon: Glyph, title, children, actions }: Props) {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-lg bg-surface px-6 py-12 text-center shadow-raised">
        <span aria-hidden className="grid size-12 place-items-center rounded-md bg-navy-05 text-ink-2">
          <Glyph size={22} />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-[22px] leading-7 font-semibold tracking-title text-balance">{title}</h1>
          <p className="text-body text-ink-muted text-pretty">{children}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2.5">{actions}</div>
      </div>
    </main>
  );
}
