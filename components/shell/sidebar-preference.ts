/**
 * What the sidebar does with its width. `auto` is the icon rail on a tablet and the full sidebar on a desktop; the other two are a choice the
 * person made, which a cookie remembers. This file has no "use client" on purpose: the server reads the cookie and the client writes it, and a
 * constant exported from a client module reaches the server as a reference, not as the string.
 */
export type SidebarPreference = "auto" | "collapsed" | "expanded";

export const SIDEBAR_COOKIE = "fx-sidebar";

export function preferenceFrom(value: string | undefined): SidebarPreference {
  return value === "collapsed" || value === "expanded" ? value : "auto";
}
