"use client";

import { CalendarBlank, ChatsCircle, FileText, Funnel, Handshake, House, IdentificationBadge, type Icon, Table, UsersThree } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isCurrent, type TenantNavIcon, type TenantNavItem } from "./nav-config";

const GLYPHS: Record<TenantNavIcon, Icon> = {
  house: House,
  table: Table,
  "file-text": FileText,
  calendar: CalendarBlank,
  users: UsersThree,
  handshake: Handshake,
  chats: ChatsCircle,
  badge: IdentificationBadge,
};

type Props = {
  items: readonly TenantNavItem[];
  portalLabel: string;
  homeHref: string;
  collapsing?: boolean;
  onNavigate?: () => void;
  footer: React.ReactNode;
};

const ITEM = "flex h-[42px] items-center gap-[11px] rounded-full px-3.5 text-[14px] font-medium outline-offwhite";

export function TenantRail({ items, portalLabel, homeHref, collapsing = false, onNavigate, footer }: Props) {
  const pathname = usePathname();
  const collapse = collapsing && "max-lg:mx-auto max-lg:w-[42px] max-lg:justify-center max-lg:px-0";

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 pt-5 pb-3 text-offwhite">
      <div className={cn("mb-2.5 flex shrink-0 items-center gap-2.5 px-2 pb-[18px] shadow-[inset_0_-1px_0_var(--on-navy-07)]", collapsing && "max-lg:justify-center max-lg:px-0")}>
        <Link href={homeHref} aria-label={portalLabel} onClick={onNavigate} className="flex items-center gap-2.5 rounded-sm outline-offwhite">
          <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-peach text-navy">
            <Funnel aria-hidden weight="fill" size={19} />
          </span>
          <div className={cn("flex flex-col", collapsing && "max-lg:hidden")}>
            <span className="text-base font-semibold tracking-[-0.01em] leading-tight">Fynix Leads</span>
            <span className="text-[11px] font-medium text-on-navy-muted">{portalLabel}</span>
          </div>
        </Link>
      </div>

      <nav aria-label="Main" className="-mx-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1 [scrollbar-width:none]">
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const Glyph = GLYPHS[item.icon];
            if (item.href === null) {
              return (
                <li key={item.label}>
                  <span
                    aria-disabled="true"
                    title={`${item.label} comes in a later phase`}
                    className={cn(ITEM, "cursor-default text-on-navy-muted", collapse)}
                  >
                    <Glyph aria-hidden size={20} className="shrink-0" />
                    <span className={cn(collapsing && "max-lg:sr-only")}>{item.label}</span>
                    <span className={cn("ml-auto rounded-full bg-on-navy-07 px-2 py-0.5 text-[11px] font-medium text-on-navy-muted", collapsing && "max-lg:hidden")}>
                      Soon
                    </span>
                    <span className="sr-only"> (coming in a later phase)</span>
                  </span>
                </li>
              );
            }
            const active = isCurrent(item.href, pathname);
            const link = (
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  ITEM,
                  "transition-colors",
                  active
                    ? "bg-peach font-semibold text-navy shadow-nav-active"
                    : "text-on-navy-text hover:bg-on-navy-07 hover:text-offwhite",
                  collapse,
                )}
              >
                <Glyph aria-hidden weight={active ? "bold" : "regular"} size={20} className="shrink-0" />
                <span className={cn(collapsing && "max-lg:sr-only")}>{item.label}</span>
              </Link>
            );
            if (!collapsing) return <li key={item.label}>{link}</li>;
            return (
              <li key={item.label}>
                <Tooltip>
                  <TooltipTrigger render={link} />
                  <TooltipContent side="right" sideOffset={10} className="lg:hidden">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={cn("mt-auto shrink-0 pt-2 shadow-[inset_0_1px_0_var(--on-navy-07)]", collapsing && "max-lg:flex max-lg:justify-center")}>{footer}</div>
    </div>
  );
}
