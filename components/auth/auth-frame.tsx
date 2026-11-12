import { Funnel } from "@phosphor-icons/react/dist/ssr";

/** The rail-less frame shared by the sign-in pages and the signed-in holding page: canvas, skip link, brand mark, then the panel. */
export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:bg-navy focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-offwhite focus:shadow-btn-primary"
      >
        Skip to content
      </a>
      <main id="main" tabIndex={-1} className="flex min-h-dvh flex-col items-center justify-center gap-5 px-4 py-8 outline-none">
        <div className="flex items-center gap-2.5 text-ink">
          <span aria-hidden className="grid size-8 place-items-center rounded-[10px] bg-peach text-navy">
            <Funnel weight="fill" size={19} />
          </span>
          <span className="text-lead font-semibold tracking-[-0.01em]">Fynix Leads</span>
        </div>
        {children}
      </main>
    </div>
  );
}

/** The white panel. `title` is the page's one h1. */
export function AuthPanel({ title, lede, children }: { title: string; lede?: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[400px] rounded-lg bg-surface px-5 pt-7 pb-6 shadow-raised sm:px-7 sm:pt-8 sm:pb-7">
      <h1 className="text-title font-semibold tracking-title">{title}</h1>
      {lede !== undefined && <p className="mt-1.5 text-body text-ink-2">{lede}</p>}
      {children}
    </div>
  );
}
