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
  | "prohibit"
  | "gear"
  | "history"
  | "envelope";

export interface NavItem {
  readonly label: string;
  readonly icon: NavIcon;
  readonly href: string;
  /** Looks up a live count (waiting leads, rejections) in the counts the layout passes. */
  readonly countKey?: string;
  /** What the count means to a screen reader: leads are "waiting", conversations are "unread". Waiting when left out. */
  readonly countKind?: "waiting" | "unread";
  /** Shown only to a Fynix admin (`forViewer`). The page refuses staff as well: hiding the link is not the lock. */
  readonly adminOnly?: boolean;
}

export interface NavGroup {
  /** Shown above the group. Leave out for the first group, which needs no label. */
  readonly label?: string;
  readonly items: readonly NavItem[];
}

export type PortalKind = "client" | "coordinator" | "agency" | "fynix";

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
          { label: "Calendar", icon: "calendar", href: "/client/calendar" },
          { label: "Meetings", icon: "calendar", href: "/client/meetings" },
          { label: "Messages", icon: "chats", href: "/client/messages", countKey: "messages", countKind: "unread" },
        ],
      },
      {
        label: "Campaign",
        items: [
          { label: "Campaigns", icon: "megaphone", href: "/client/campaigns" },
          { label: "Working hours", icon: "users", href: "/client/hours" },
          { label: "Agreement", icon: "handshake", href: "/client/agreement" },
          { label: "Team", icon: "team", href: "/client/team" },
          { label: "Exclusions", icon: "prohibit", href: "/client/exclusions" },
        ],
      },
    ],
  },
  coordinator: {
    kind: "coordinator",
    label: "Coordinator portal",
    homeHref: "/coordinator",
    mobileTabs: ["/coordinator", "/coordinator/leads", "/coordinator/meetings", "/coordinator/messages"],
    groups: [
      {
        label: "Work",
        items: [
          { label: "Overview", icon: "house", href: "/coordinator" },
          { label: "Leads", icon: "table", href: "/coordinator/leads" },
          { label: "Calendar", icon: "calendar", href: "/coordinator/calendar" },
          { label: "Meetings", icon: "calendar", href: "/coordinator/meetings" },
          { label: "Messages", icon: "chats", href: "/coordinator/messages", countKey: "messages", countKind: "unread" },
        ],
      },
      {
        label: "Delivery",
        items: [
          { label: "Campaigns", icon: "megaphone", href: "/coordinator/campaigns" },
          { label: "Partner agencies", icon: "users", href: "/coordinator/agencies" },
          { label: "Team", icon: "team", href: "/coordinator/team" },
          { label: "Agreement", icon: "handshake", href: "/coordinator/agreement" },
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
          { label: "Calendar", icon: "calendar", href: "/agency/calendar" },
          { label: "Meetings", icon: "calendar", href: "/agency/meetings" },
          { label: "Messages", icon: "chats", href: "/agency/messages", countKey: "messages", countKind: "unread" },
        ],
      },
      {
        label: "Setup",
        items: [
          { label: "Campaigns", icon: "megaphone", href: "/agency/campaigns" },
          { label: "Team", icon: "team", href: "/agency/team" },
        ],
      },
    ],
  },
  fynix: {
    kind: "fynix",
    label: "Fynix team",
    homeHref: "/fynix",
    mobileTabs: ["/fynix", "/fynix/leads", "/fynix/inbox", "/fynix/rejections"],
    groups: [
      {
        label: "Work",
        items: [
          { label: "Overview", icon: "house", href: "/fynix" },
          { label: "Leads", icon: "table", href: "/fynix/leads" },
          { label: "Calendar", icon: "calendar", href: "/fynix/calendar" },
          { label: "Meetings", icon: "calendar", href: "/fynix/meetings" },
          { label: "Inbox", icon: "chats", href: "/fynix/inbox", countKey: "messages", countKind: "unread" },
          { label: "Rejections", icon: "scales", href: "/fynix/rejections", countKey: "rejections" },
        ],
      },
      {
        label: "Accounts",
        items: [
          { label: "Clients", icon: "buildings", href: "/fynix/clients" },
          { label: "Coordinators", icon: "users", href: "/fynix/coordinators" },
          { label: "Agencies", icon: "handshake", href: "/fynix/agencies" },
          { label: "Campaigns", icon: "megaphone", href: "/fynix/campaigns" },
        ],
      },
      {
        label: "System",
        items: [
          { label: "Settings", icon: "gear", href: "/fynix/settings" },
          { label: "Audit log", icon: "history", href: "/fynix/audit", adminOnly: true },
          { label: "Email templates", icon: "envelope", href: "/fynix/templates", adminOnly: true },
        ],
      },
    ],
  },
};

/** The portal as one viewer sees it: items marked `adminOnly` are left out for anyone who is not an admin, and a group left empty goes with them. */
export function forViewer(portal: PortalConfig, isAdmin: boolean): PortalConfig {
  if (isAdmin) return portal;
  const groups = portal.groups.map((group) => ({ ...group, items: group.items.filter((item) => item.adminOnly !== true) })).filter((group) => group.items.length > 0);
  return { ...portal, groups };
}

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
  if (pathname === `${portal.homeHref}/notices`) return ["Notices"];
  const item = currentItem(portal, pathname);
  if (!item || !pathname) return [portal.label];
  const rest = pathname.slice(item.href.length).split("/").filter(Boolean);
  if (rest.length === 0) return [item.label];
  const first = rest[0] ?? "";
  const tail = first === "new" ? "New" : decodeURIComponent(first);
  return [item.label, tail];
}
