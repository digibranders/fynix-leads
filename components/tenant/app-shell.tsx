import { Funnel } from "@phosphor-icons/react/dist/ssr";
import { initialsOf } from "@/lib/auth/display";
import { TenantMobileNav } from "./mobile-nav";
import { TenantRail } from "./rail";
import { TenantRailFooter } from "./rail-footer";
import type { TenantNavItem } from "./nav-config";

const SKIP_LINK =
  "sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:bg-navy focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-offwhite focus:shadow-btn-primary";

type Props = {
  userName: string;
  roleLabel: string;
  portalLabel: string;
  homeHref: string;
  navItems: readonly TenantNavItem[];
  children: React.ReactNode;
};

export function TenantShell({
  userName,
  roleLabel,
  portalLabel,
  homeHref,
  navItems,
  children,
}: Props) {
  const footer = <TenantRailFooter name={userName} roleLabel={roleLabel} />;
  const iconFooter = <TenantRailFooter name={userName} roleLabel={roleLabel} collapsing />;

  return (
    <div className="min-h-dvh bg-canvas">
      <a href="#main" className={SKIP_LINK}>
        Skip to content
      </a>

      <header className="sticky top-0 z-30 flex h-[60px] items-center gap-2 bg-navy px-2.5 text-offwhite md:hidden">
        <TenantMobileNav items={navItems} portalLabel={portalLabel} homeHref={homeHref} footer={footer} />
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-peach text-navy">
          <Funnel weight="fill" size={19} />
        </span>
        <span className="text-base font-semibold tracking-[-0.01em]">Fynix Leads</span>
        <span className="text-xs text-on-navy-muted">({portalLabel})</span>
        <span role="img" aria-label={userName} className="ml-auto grid size-10 place-items-center rounded-full bg-peach text-[13px] font-semibold text-navy">
          {initialsOf(userName)}
        </span>
      </header>

      <aside aria-label="Sidebar" className="fixed inset-y-3 left-3 z-30 flex w-[72px] flex-col overflow-hidden rounded-xl bg-navy shadow-rail max-md:hidden lg:w-[220px]">
        <TenantRail items={navItems} portalLabel={portalLabel} homeHref={homeHref} collapsing footer={iconFooter} />
      </aside>

      <main id="main" tabIndex={-1} className="min-h-dvh px-4 pt-5 pb-10 outline-none md:pr-6 md:pl-[100px] lg:pl-[248px] max-md:min-h-[calc(100dvh-60px)]">
        <div className="mx-auto w-full max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}
