/**
 * The navigation of the four portals, in one place. Icons are named, not imported: the lists are built in server layouts and
 * handed to client components, and a component function cannot cross that boundary (see sidebar.tsx for the glyph map).
 */
export type NavIcon =
  | "house"
  | "tray"
  | "table"
  | "calendar"
  | "chats"
  | "megaphone"
  | "users"
  | "team"
  | "handshake"
  | "badge"
  | "buildings"
  | "scales"
  | "gear";

export interface NavItem {
  readonly label: string;
  readonly icon: NavIcon;
  readonly href: string;
  /** Looks up a live count (waiting leads, open disputes) in the counts the layout passes. */
  readonly countKey?: string;
}

export interface NavGroup {
  /** Shown above the group. Leave out for the first group, which needs no label. */
  readonly label?: string;
  readonly items: readonly NavItem[];
}

export type PortalKind = "client" | "supplier" | "agency" | "fynix";

export interface PortalConfig {
  readonly kind: PortalKind;
  /** Shown under the brand in the sidebar. */
  readonly label: string;
  readonly homeHref: string;
  readonly groups: readonly NavGroup[];
  /** The four items on the phone's tab bar, in order. A fifth slot, More, opens a sheet with every other item. */
  readonly mobileTabs: readonly string[];
}

export const PORTALS: Record<PortalKind, PortalConfig> = {
  client: {
    kind: "client",
    label: "Client portal",
    homeHref: "/client",
    mobileTabs: ["/client", "/client/review", "/client/meetings", "/client/messages"],
    groups: [
      {
        label: "Work",
        items: [
          { label: "Overview", icon: "house", href: "/client" },
          { label: "Availability", icon: "tray", href: "/client/review", countKey: "respond" },
          { label: "Leads", icon: "table", href: "/client/leads" },
          { label: "Meetings", icon: "calendar", href: "/client/meetings" },
          { label: "Messages", icon: "chats", href: "/client/messages" },
        ],
      },
      {
        label: "Campaign",
        items: [
          { label: "Campaigns", icon: "megaphone", href: "/client/campaigns" },
          { label: "Hosts & hours", icon: "users", href: "/client/hosts" },
          { label: "Agreement", icon: "handshake", href: "/client/agreement" },
          { label: "Team", icon: "team", href: "/client/team" },
        ],
      },
    ],
  },
  supplier: {
    kind: "supplier",
    label: "Coordinator portal",
    homeHref: "/supplier",
    mobileTabs: ["/supplier", "/supplier/leads", "/supplier/meetings", "/supplier/messages"],
    groups: [
      {
        label: "Work",
        items: [
          { label: "Overview", icon: "house", href: "/supplier" },
          { label: "Leads", icon: "table", href: "/supplier/leads" },
          { label: "Meetings", icon: "calendar", href: "/supplier/meetings" },
          { label: "Messages", icon: "chats", href: "/supplier/messages" },
        ],
      },
      {
        label: "Delivery",
        items: [
          { label: "Campaigns", icon: "megaphone", href: "/supplier/campaigns" },
          { label: "Partner agencies", icon: "users", href: "/supplier/agencies" },
          { label: "Team", icon: "team", href: "/supplier/team" },
          { label: "Aliases", icon: "badge", href: "/supplier/aliases" },
          { label: "Agreement", icon: "handshake", href: "/supplier/agreement" },
        ],
      },
    ],
  },
  agency: {
    kind: "agency",
    label: "Agency portal",
    homeHref: "/agency",
    mobileTabs: ["/agency", "/agency/leads", "/agency/meetings", "/agency/messages"],
    groups: [
      {
        label: "Work",
        items: [
          { label: "Overview", icon: "house", href: "/agency" },
          { label: "Leads", icon: "table", href: "/agency/leads" },
          { label: "Meetings", icon: "calendar", href: "/agency/meetings" },
          { label: "Messages", icon: "chats", href: "/agency/messages" },
        ],
      },
      {
        label: "Setup",
        items: [
          { label: "Campaigns", icon: "megaphone", href: "/agency/campaigns" },
          { label: "My aliases", icon: "badge", href: "/agency/aliases" },
          { label: "Team", icon: "team", href: "/agency/team" },
        ],
      },
    ],
  },
  fynix: {
    kind: "fynix",
    label: "Fynix team",
    homeHref: "/fynix",
    mobileTabs: ["/fynix", "/fynix/leads", "/fynix/inbox", "/fynix/disputes"],
    groups: [
      {
        label: "Work",
        items: [
          { label: "Overview", icon: "house", href: "/fynix" },
          { label: "Leads", icon: "table", href: "/fynix/leads" },
          { label: "Meetings", icon: "calendar", href: "/fynix/meetings" },
          { label: "Inbox", icon: "chats", href: "/fynix/inbox" },
          { label: "Disputes", icon: "scales", href: "/fynix/disputes", countKey: "disputes" },
        ],
      },
      {
        label: "Accounts",
        items: [
          { label: "Clients", icon: "buildings", href: "/fynix/clients" },
          { label: "Coordinators", icon: "users", href: "/fynix/suppliers" },
          { label: "Campaigns", icon: "megaphone", href: "/fynix/campaigns" },
        ],
      },
      {
        label: "System",
        items: [{ label: "Settings", icon: "gear", href: "/fynix/settings" }],
      },
    ],
  },
};

/** Every nav item of a portal, flat, for the palette and the breadcrumb. */
export function flatItems(portal: PortalConfig): readonly NavItem[] {
  return portal.groups.flatMap((group) => group.items);
}

/** The items on the phone's tab bar, in the order the portal asks for. */
export function tabItems(portal: PortalConfig): readonly NavItem[] {
  const all = flatItems(portal);
  return portal.mobileTabs.flatMap((href) => all.filter((item) => item.href === href));
}

/** What the More sheet lists: the portal's groups without the items already on the tab bar. A group left empty is dropped. */
export function moreGroups(portal: PortalConfig): readonly NavGroup[] {
  const onBar = new Set(portal.mobileTabs);
  return portal.groups.map((group) => ({ ...group, items: group.items.filter((item) => !onBar.has(item.href)) })).filter((group) => group.items.length > 0);
}

/**
 * The item a path belongs to: the longest href that is the path or a parent of it. The home item matches only its own path,
 * so Overview is never lit on a sub-page.
 */
export function currentItem(portal: PortalConfig, pathname: string | null): NavItem | null {
  if (!pathname) return null;
  let best: NavItem | null = null;
  for (const item of flatItems(portal)) {
    const isHome = item.href === portal.homeHref;
    const hit = isHome ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (hit && (best === null || item.href.length > best.href.length)) best = item;
  }
  return best;
}

/** The trail for the top bar: the section, then the one segment below it when the page is a record ("Campaigns, CMP-4821"). */
export function breadcrumb(portal: PortalConfig, pathname: string | null): readonly string[] {
  if (pathname === `${portal.homeHref}/profile`) return ["Profile"];
  const item = currentItem(portal, pathname);
  if (!item || !pathname) return [portal.label];
  const rest = pathname.slice(item.href.length).split("/").filter(Boolean);
  if (rest.length === 0) return [item.label];
  const first = rest[0] ?? "";
  const tail = first === "new" ? "New" : decodeURIComponent(first);
  return [item.label, tail];
}
