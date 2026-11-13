import { Funnel } from "@phosphor-icons/react/dist/ssr";
import { initialsOf } from "@/lib/auth/display";
import { requireFynix } from "@/server/fynix/session";
import { FynixMobileNav } from "./mobile-nav";
import { FynixRail } from "./rail";
import { FynixRailFooter } from "./rail-footer";

const SKIP_LINK =
  "sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:bg-navy focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-offwhite focus:shadow-btn-primary";

/**
 * The Fynix shell for a signed-in Fynix member: the floating navy rail from `md`, a navy top bar below it, and the canvas.
 * Layout switches by CSS only. It reads the session, so it sits behind a `<Suspense>` boundary (the layout puts it there) and a
 * session that is not Fynix gets the not-found page.
 */
export async function FynixShell({ children }: { children: React.ReactNode }) {
  const view = await requireFynix();
  const footer = <FynixRailFooter name={view.name} canWrite={view.canWrite} />;
  const iconFooter = <FynixRailFooter name={view.name} canWrite={view.canWrite} collapsing />;

  return (
    <div className="min-h-dvh bg-canvas">
      <a href="#main" className={SKIP_LINK}>
        Skip to content
      </a>

      <header className="sticky top-0 z-30 flex h-[60px] items-center gap-2 bg-navy px-2.5 text-offwhite md:hidden">
        <FynixMobileNav footer={footer} />
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-peach text-navy">
          <Funnel weight="fill" size={19} />
        </span>
        <span className="text-base font-semibold tracking-[-0.01em]">Fynix Leads</span>
        <span role="img" aria-label={view.name} className="ml-auto grid size-10 place-items-center rounded-full bg-peach text-[13px] font-semibold text-navy">
          {initialsOf(view.name)}
        </span>
      </header>

      <aside aria-label="Sidebar" className="fixed inset-y-3 left-3 z-30 flex w-[72px] flex-col overflow-hidden rounded-xl bg-navy shadow-rail max-md:hidden lg:w-[220px]">
        <FynixRail collapsing footer={iconFooter} />
      </aside>

      <main id="main" tabIndex={-1} className="min-h-dvh px-4 pt-5 pb-10 outline-none md:pr-6 md:pl-[100px] lg:pl-[248px] max-md:min-h-[calc(100dvh-60px)]">
        <div className="mx-auto w-full max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}
