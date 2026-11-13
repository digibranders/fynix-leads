import type { Icon } from "@phosphor-icons/react";
import { Buildings, CalendarBlank, ChatsCircle, Gear, House, Megaphone, Scales, Table, UsersThree } from "@phosphor-icons/react/dist/ssr";

export interface FynixNavItem {
  readonly label: string;
  readonly icon: Icon;
  /** Where the item goes. `null` while the screen does not exist yet: the item shows, says it is coming, and is not a link. */
  readonly href: string | null;
}

/** The Fynix rail, in the order of the approved comps. Only Suppliers and Campaigns exist in phase 1D. */
export const FYNIX_NAV: readonly FynixNavItem[] = [
  { label: "Overview", icon: House, href: null },
  { label: "Clients", icon: Buildings, href: null },
  { label: "Suppliers", icon: UsersThree, href: "/fynix/suppliers" },
  { label: "Campaigns", icon: Megaphone, href: "/fynix/campaigns" },
  { label: "Leads", icon: Table, href: null },
  { label: "Meetings", icon: CalendarBlank, href: null },
  { label: "Inbox", icon: ChatsCircle, href: null },
  { label: "Disputes", icon: Scales, href: null },
  { label: "Settings", icon: Gear, href: null },
];

/** A link item is current on its own path and below it, so a campaign page keeps Campaigns lit. */
export function isCurrent(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
