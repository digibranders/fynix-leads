import type { Icon } from "@phosphor-icons/react";
import { IdentificationCard, ListChecks, Table } from "@phosphor-icons/react/dist/ssr";
import { reviewQueue } from "@/lib/review/queue";
import { SAMPLE_CAMPAIGN, SAMPLE_LEADS } from "@/lib/sample/data";

export type Role = "client" | "agency";

export type NavItem = {
  href: string;
  label: string;
  icon: Icon;
  /** Path prefix that keeps the item active on deeper routes. Defaults to `href`. */
  match?: string;
  /** A count shown beside the label, for example the leads waiting for review. */
  count?: number;
};

export const NAV: Record<Role, NavItem[]> = {
  client: [
    { href: "/client/review", label: "Review queue", icon: ListChecks, count: reviewQueue(SAMPLE_LEADS).length },
    { href: "/client/leads/LD-4K9P", label: "Lead record", icon: IdentificationCard, match: "/client/leads/" },
  ],
  agency: [{ href: "/agency/leads", label: "Leads", icon: Table }],
};

export const ROLE_HOME: Record<Role, string> = {
  client: "/client/review",
  agency: "/agency/leads",
};

export const ROLE_LABEL: Record<Role, string> = { client: "Client", agency: "Agency" };

/** Who the prototype is showing the app to, per role. */
export const ROLE_PARTY: Record<Role, string> = { client: SAMPLE_CAMPAIGN.brand, agency: "Fynix team" };

/** "Kestrel Ledger" becomes "KL". */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

/** The role comes from the first path segment. Anything else falls back to the client view. */
export function roleFromPath(pathname: string): Role {
  return pathname.split("/")[1] === "agency" ? "agency" : "client";
}

export function isActive(item: NavItem, pathname: string): boolean {
  const base = item.match ?? item.href;
  return pathname === base || pathname.startsWith(base.endsWith("/") ? base : `${base}/`);
}
