import type { Icon } from "@phosphor-icons/react";
import { Buildings, CalendarBlank, ChatsCircle, Gear, House, Megaphone, Scales, Table, UsersThree } from "@phosphor-icons/react/dist/ssr";

export interface FynixNavItem {
  readonly label: string;
  readonly icon: Icon;
  /** Where the item goes. `null` while the screen does not exist yet: the item shows, says it is coming, and is not a link. */
  readonly href: string | null;
}

/** The Fynix rail, in the order of the approved comps. */
export const FYNIX_NAV: readonly FynixNavItem[] = [
  { label: "Overview", icon: House, href: "/fynix" },
  { label: "Clients", icon: Buildings, href: "/fynix/clients" },
  { label: "Suppliers", icon: UsersThree, href: "/fynix/suppliers" },
  { label: "Campaigns", icon: Megaphone, href: "/fynix/campaigns" },
  { label: "Leads", icon: Table, href: "/fynix/leads" },
  { label: "Meetings", icon: CalendarBlank, href: "/fynix/meetings" },
  { label: "Inbox", icon: ChatsCircle, href: "/fynix/inbox" },
  { label: "Disputes", icon: Scales, href: "/fynix/disputes" },
  { label: "Settings", icon: Gear, href: "/fynix/settings" },
];

/** A link item is current on its own path and below it, so a campaign page keeps Campaigns lit. Overview is the root, so it matches only itself. */
export function isCurrent(href: string, pathname: string): boolean {
  if (href === "/fynix") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
