"use client";

import {
  Buildings,
  CalendarBlank,
  ChatsCircle,
  ClockCounterClockwise,
  EnvelopeSimple,
  Funnel,
  Gear,
  Handshake,
  House,
  IdentificationBadge,
  Megaphone,
  Prohibit,
  Scales,
  SidebarSimple,
  Table,
  Tray,
  UsersFour,
  UsersThree,
  type Icon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { badgeLabel, formatBadge } from "@/lib/shell/badge";
import { cn } from "@/lib/utils";
import { useSidebar } from "./shell-frame";
import { currentItem, type NavIcon, type PortalConfig } from "./nav";

export const GLYPHS: Record<NavIcon, Icon> = {
  house: House,
  tray: Tray,
  table: Table,
  calendar: CalendarBlank,
  chats: ChatsCircle,
  megaphone: Megaphone,
  users: UsersThree,
  team: UsersFour,
  handshake: Handshake,
  badge: IdentificationBadge,
  buildings: Buildings,
  scales: Scales,
  prohibit: Prohibit,
  gear: Gear,
  history: ClockCounterClockwise,
  envelope: EnvelopeSimple,
};

interface Props {
  portal: PortalConfig;
  /** Live counts by `countKey`. A missing or zero count shows nothing. */
  counts?: Readonly<Record<string, number>>;
  /** The signed-in person and sign-out, rendered on the server. */
  footer: React.ReactNode;
  /** Closes the mobile sheet when a link is followed. */
  onNavigate?: () => void;
}

/** The sidebar body: brand, grouped links with counts, the person at the bottom. Used in the fixed aside and in the mobile sheet. */
export function SidebarContent({ portal, counts = {}, footer, onNavigate }: Props) {
  const pathname = usePathname();
  const active = currentItem(portal, pathname);
  const { rail, toggle } = useSidebar();

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 px-3 pt-4 pb-3 text-on-navy-text">
      <Link
        href={portal.homeHref}
        onClick={onNavigate}
        className="sb-brand flex items-center gap-2.5 rounded-sm px-1.5 py-1 outline-offset-2 outline-offwhite"
      >
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-sm bg-peach text-navy">
          <Funnel weight="fill" size={15} />
        </span>
        <span className="sb-hide flex flex-col leading-tight">
          <span className="text-[14.5px] font-semibold tracking-[-0.01em] text-offwhite">Fynix Leads</span>
          <span className="text-caption text-on-navy-muted">{portal.label}</span>
        </span>
      </Link>

      <nav aria-label="Main" className="sb-nav -mx-1 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1 [scrollbar-width:none]">
        {portal.groups.map((group, index) => (
          <div key={group.label ?? index} className="flex flex-col gap-0.5">
            {group.label ? (
              <p className="sb-hide px-2.5 pb-1 text-[11px] font-semibold tracking-[0.07em] text-on-navy-muted uppercase">{group.label}</p>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const Glyph = GLYPHS[item.icon];
                const here = active?.href === item.href;
                const count = item.countKey ? (counts[item.countKey] ?? 0) : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={here ? "page" : undefined}
                      data-label={item.label}
                      className={cn(
                        "sb-item relative flex h-9 items-center gap-2.5 rounded-sm px-2.5 text-[13.5px] font-medium outline-offset-2 outline-offwhite transition-colors hover:bg-on-navy-05 hover:text-offwhite",
                        here && "bg-on-navy-07 text-offwhite before:absolute before:top-2 before:bottom-2 before:-left-3 before:w-[3px] before:rounded-r-full before:bg-peach",
                      )}
                    >
                      <Glyph aria-hidden size={17} className={cn("shrink-0", here ? "text-peach" : "text-on-navy-muted")} />
                      <span className="sb-hide truncate">{item.label}</span>
                      {count > 0 ? <span aria-hidden className="sb-dot" /> : null}
                      {count > 0 ? (
                        <b
                          aria-label={badgeLabel(count, item.countKind)}
                          className="sb-hide ml-auto rounded-xs bg-peach/16 px-1.5 text-[11.5px] leading-[18px] font-semibold text-[#f3cdb0]"
                        >
                          {formatBadge(count)}
                        </b>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-1 pt-3 shadow-[inset_0_1px_0_var(--on-navy-07)]">
        <button
          type="button"
          onClick={toggle}
          aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
          data-label={rail ? "Expand sidebar" : "Collapse sidebar"}
          className="sb-item relative flex h-9 items-center gap-2.5 rounded-sm px-2.5 text-[13.5px] font-medium text-on-navy-muted outline-offset-2 outline-offwhite transition-colors hover:bg-on-navy-05 hover:text-offwhite"
        >
          <SidebarSimple aria-hidden size={17} className="sb-flip shrink-0" />
          <span className="sb-hide truncate">Collapse</span>
        </button>
        {footer}
      </div>
    </div>
  );
}
