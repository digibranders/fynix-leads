import type { Icon } from "@phosphor-icons/react";
import {
  CalendarBlank,
  ChatsCircle,
  FileText,
  Handshake,
  House,
  IdentificationBadge,
  Table,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";

export interface TenantNavItem {
  readonly label: string;
  readonly icon: Icon;
  readonly href: string | null;
}

export const CLIENT_NAV: readonly TenantNavItem[] = [
  { label: "Overview", icon: House, href: "/client" },
  { label: "To respond", icon: Table, href: "/client/review" },
  { label: "Leads", icon: FileText, href: "/client/leads" },
  { label: "Meetings", icon: CalendarBlank, href: "/client/meetings" },
  { label: "Hosts & hours", icon: UsersThree, href: "/client/hosts" },
  { label: "Agreement", icon: Handshake, href: "/client/agreement" },
  { label: "Messages", icon: ChatsCircle, href: "/client/messages" },
];

export const SUPPLIER_NAV: readonly TenantNavItem[] = [
  { label: "Overview", icon: House, href: "/supplier" },
  { label: "Leads", icon: Table, href: "/supplier/leads" },
  { label: "Meetings", icon: CalendarBlank, href: "/supplier/meetings" },
  { label: "Partner agencies", icon: UsersThree, href: "/supplier/agencies" },
  { label: "Aliases", icon: IdentificationBadge, href: "/supplier/aliases" },
  { label: "Agreement", icon: Handshake, href: "/supplier/agreement" },
  { label: "Messages", icon: ChatsCircle, href: "/supplier/messages" },
];

export const AGENCY_NAV: readonly TenantNavItem[] = [
  { label: "Overview", icon: House, href: "/agency" },
  { label: "Leads", icon: Table, href: "/agency/leads" },
  { label: "Meetings", icon: CalendarBlank, href: "/agency/meetings" },
  { label: "My Aliases", icon: IdentificationBadge, href: "/agency/aliases" },
  { label: "Messages", icon: ChatsCircle, href: "/agency/messages" },
];

export function isCurrent(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
