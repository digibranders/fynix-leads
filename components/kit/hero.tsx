import { cn } from "@/lib/utils";

/**
 * The one navy card of a screen: what needs the person now on the left, the number they are working toward on the right.
 * Navy is reserved for this card and the sidebar, so the eye lands here first.
 */
export function Hero({
  kicker,
  title,
  description,
  actions,
  aside,
  className,
}: {
  kicker: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative grid overflow-hidden rounded-lg bg-navy text-offwhite shadow-hero md:grid-cols-[1.35fr_1fr]",
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-[340px] rounded-full [background:var(--hero-glow)]" />
      <div className="relative flex flex-col gap-1 p-6 md:p-7">
        <p className="text-label font-semibold text-peach">{kicker}</p>
        <h2 className="mt-1 text-[28px] leading-[32px] font-semibold tracking-title text-balance">{title}</h2>
        {description ? <p className="text-body text-on-navy-text">{description}</p> : null}
        {actions ? <div className="mt-5 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {aside ? (
        <div className="relative flex flex-col justify-center gap-2 p-6 shadow-[inset_0_1px_0_var(--on-navy-07)] md:p-7 md:shadow-[inset_1px_0_0_var(--on-navy-07)]">
          {aside}
        </div>
      ) : null}
    </section>
  );
}
