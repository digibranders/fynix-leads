import { CalendarCheck, ChatsCircle, Funnel, Tray } from "@phosphor-icons/react/dist/ssr";

const POINTS = [
  { icon: Tray, text: "Review qualified leads and choose a meeting time." },
  { icon: CalendarCheck, text: "See what is booked, held and delivered." },
  { icon: ChatsCircle, text: "Keep every message with the team in one place." },
] as const;

/**
 * The frame of the sign-in pages and the holding page. Two halves from `lg`: the form on the warm canvas, a navy panel that says what the
 * product is for. Below `lg` only the form shows. The panel is an `aside`, so the page's one `main` is the form.
 */
export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-sm focus:bg-navy focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-offwhite focus:shadow-btn-primary"
      >
        Skip to content
      </a>

      <div className="flex min-h-dvh flex-col px-5 py-6 sm:px-10 lg:px-14">
        <div className="flex items-center gap-2.5 text-ink">
          <span aria-hidden className="grid size-8 place-items-center rounded-sm bg-peach text-navy">
            <Funnel weight="fill" size={18} />
          </span>
          <span className="text-lead font-semibold tracking-[-0.01em]">Fynix Leads</span>
        </div>
        <main id="main" tabIndex={-1} className="flex flex-1 flex-col items-center justify-center py-10 outline-none">
          {children}
        </main>
      </div>

      <aside aria-label="About Fynix Leads" className="relative hidden overflow-hidden bg-navy p-14 text-offwhite lg:flex lg:flex-col lg:justify-end">
        <div aria-hidden className="pointer-events-none absolute -top-32 -right-24 size-[420px] rounded-full opacity-60 [background:var(--hero-glow)]" />
        <div className="relative flex max-w-[460px] flex-col gap-8">
          <h2 className="text-[34px] leading-[38px] font-semibold tracking-title text-balance">Follow every lead from first call to delivery.</h2>
          <ul className="flex flex-col gap-4">
            {POINTS.map(({ icon: Glyph, text }) => (
              <li key={text} className="flex items-center gap-3.5 text-lead text-on-navy-text">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-sm bg-on-navy-07 text-peach">
                  <Glyph size={19} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

/** The form panel. `title` is the page's one h1; leave it out only for a loading placeholder, which has no heading to announce. `wide` (440) is for the screen that carries terms to read. */
export function AuthPanel({ title, lede, wide = false, children }: { title?: string; lede?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`w-full ${wide ? "max-w-[440px]" : "max-w-[400px]"} rounded-lg bg-surface px-5 pt-7 pb-6 shadow-raised sm:px-7 sm:pt-8 sm:pb-7`}>
      {title !== undefined && <h1 className="text-title font-semibold tracking-title">{title}</h1>}
      {lede !== undefined && <p className="mt-1.5 text-body text-ink-muted">{lede}</p>}
      {children}
    </div>
  );
}
