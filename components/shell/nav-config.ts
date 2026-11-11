import type { Icon } from "@phosphor-icons/react";
import { IdentificationCard, ListChecks, Table } from "@phosphor-icons/react/dist/ssr";

export type Role = "client" | "agency";

export type NavItem = {
  href: string;
  label: string;
  icon: Icon;
  /** Path prefix that keeps the item active on deeper routes. Defaults to `href`. */
  match?: string;
};

export const NAV: Record<Role, NavItem[]> = {
  client: [
    { href: "/client/review", label: "Review queue", icon: ListChecks },
    { href: "/client/leads/LD-4K9P", label: "Lead record", icon: IdentificationCard, match: "/client/leads/" },
  ],
  agency: [{ href: "/agency/leads", label: "Leads", icon: Table }],
};

export const ROLE_HOME: Record<Role, string> = {
  client: "/client/review",
  agency: "/agency/leads",
};

export const ROLE_LABEL: Record<Role, string> = { client: "Client", agency: "Agency" };

/** The role comes from the first path segment. Anything else falls back to the client view. */
export function roleFromPath(pathname: string): Role {
  return pathname.split("/")[1] === "agency" ? "agency" : "client";
}

export function isActive(item: NavItem, pathname: string): boolean {
  const base = item.match ?? item.href;
  return pathname === base || pathname.startsWith(base.endsWith("/") ? base : `${base}/`);
}

export function titleFor(role: Role, pathname: string): string {
  return NAV[role].find((item) => isActive(item, pathname))?.label ?? "Fynix Leads";
}
