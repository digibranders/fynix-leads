import { cookies } from "next/headers";
import { PORTALS, type PortalKind } from "./nav";
import { ShellFrame } from "./shell-frame";
import { preferenceFrom, SIDEBAR_COOKIE } from "./sidebar-preference";
import { SidebarContent } from "./sidebar";
import { TabBar } from "./tab-bar";
import { Topbar, TOP_SENTINEL_ID } from "./topbar";
import { UserMenu } from "./user-menu";

interface Props {
  portal: PortalKind;
  userName: string;
  roleLabel: string;
  /** Live counts shown beside nav items, keyed by the item's `countKey`. */
  counts?: Readonly<Record<string, number>>;
  /** Unread notices for the bell in the top bar. */
  unreadNotices?: number;
  children: React.ReactNode;
}

/**
 * The one shell of all four portals. From `md`: a fixed navy sidebar that folds into an icon rail, a thin top strip with the trail and
 * search, and the page on the warm canvas. On a phone: a glass strip at the top, the page, and a glass tab bar floating at the bottom with
 * the rest of the menu in a sheet. Layout switches by CSS only. The layout that renders it reads the session, so it sits behind a
 * `<Suspense>` boundary, and reading the sidebar cookie here costs nothing extra.
 */
export async function AppShell({ portal, userName, roleLabel, counts = {}, unreadNotices = 0, children }: Props) {
  const config = PORTALS[portal];
  const footer = <UserMenu name={userName} roleLabel={roleLabel} profileHref={`${config.homeHref}/profile`} />;
  const initial = preferenceFrom((await cookies()).get(SIDEBAR_COOKIE)?.value);

  return (
    <ShellFrame initial={initial} sidebar={<SidebarContent portal={config} counts={counts} footer={footer} />}>
      {/* The surface is what sinks back behind the More sheet on a phone; the bar and the sheet stay outside it. */}
      <div className="app-surface min-h-dvh bg-canvas md:pl-(--sidebar-w) md:transition-[padding-left] md:duration-300 md:ease-(--ease-out)">
        <Topbar portal={config} unreadNotices={unreadNotices} />
        <main id="main" tabIndex={-1} className="relative px-4 pt-1 pb-(--tabbar-clear) outline-none md:px-7 md:pt-6 md:pb-12">
          <span id={TOP_SENTINEL_ID} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28" />
          <div className="mx-auto w-full max-w-(--content-max)">{children}</div>
        </main>
      </div>

      <TabBar portal={config} counts={counts} footer={footer} />
    </ShellFrame>
  );
}
