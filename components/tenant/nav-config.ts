/**
 * Icons are named, not imported: the nav lists are built in server layouts and handed to the client rail, and a
 * component function cannot cross that boundary. The rail maps each name to its glyph (see rail.tsx).
 */
export type TenantNavIcon = "house" | "table" | "file-text" | "calendar" | "users" | "handshake" | "chats" | "badge" | "megaphone";

export interface TenantNavItem {
  readonly label: string;
  readonly icon: TenantNavIcon;
  readonly href: string | null;
}

export const CLIENT_NAV: readonly TenantNavItem[] = [
  { label: "Overview", icon: "house", href: "/client" },
  { label: "Campaigns", icon: "megaphone", href: "/client/campaigns" },
  { label: "To respond", icon: "table", href: "/client/review" },
  { label: "Leads", icon: "file-text", href: "/client/leads" },
  { label: "Meetings", icon: "calendar", href: "/client/meetings" },
  { label: "Hosts & hours", icon: "users", href: "/client/hosts" },
  { label: "Agreement", icon: "handshake", href: "/client/agreement" },
  { label: "Messages", icon: "chats", href: "/client/messages" },
];

export const SUPPLIER_NAV: readonly TenantNavItem[] = [
  { label: "Overview", icon: "house", href: "/supplier" },
  { label: "Campaigns", icon: "megaphone", href: "/supplier/campaigns" },
  { label: "Leads", icon: "table", href: "/supplier/leads" },
  { label: "Meetings", icon: "calendar", href: "/supplier/meetings" },
  { label: "Partner agencies", icon: "users", href: "/supplier/agencies" },
  { label: "Aliases", icon: "badge", href: "/supplier/aliases" },
  { label: "Agreement", icon: "handshake", href: "/supplier/agreement" },
  { label: "Messages", icon: "chats", href: "/supplier/messages" },
];

export const AGENCY_NAV: readonly TenantNavItem[] = [
  { label: "Overview", icon: "house", href: "/agency" },
  { label: "Campaigns", icon: "megaphone", href: "/agency/campaigns" },
  { label: "Leads", icon: "table", href: "/agency/leads" },
  { label: "Meetings", icon: "calendar", href: "/agency/meetings" },
  { label: "My Aliases", icon: "badge", href: "/agency/aliases" },
  { label: "Messages", icon: "chats", href: "/agency/messages" },
];

/** A portal's home item (`/agency`) is current on its own URL only: every other page of the portal sits below it. */
export function isCurrent(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  if (href.split("/").length === 2) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
