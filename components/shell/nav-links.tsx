"use client";

import Link from "next/link";
import { usePendingCount } from "@/lib/review/use-pending-count";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isActive, NAV, type Role } from "./nav-config";

type Props = {
  role: Role;
  pathname: string;
  /** From `md` to `lg` the rail shows icons only, with a tooltip. */
  collapsing?: boolean;
  onNavigate?: () => void;
};

export function NavLinks({ role, pathname, collapsing = false, onNavigate }: Props) {
  const pending = usePendingCount();
  return (
    <nav aria-label="Main">
      <ul className="flex flex-col gap-1">
        {NAV[role].map((item) => {
          const active = isActive(item, pathname);
          const Glyph = item.icon;
          const count = item.showsPendingCount ? pending : undefined;
          const hasCount = count !== undefined && count > 0;
          const link = (
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={collapsing ? (hasCount ? `${item.label}, ${count}` : item.label) : undefined}
              onClick={onNavigate}
              className={cn(
                "flex h-[42px] items-center gap-[11px] rounded-full px-3.5 text-[14px] font-medium outline-offwhite transition-[background-color,color,box-shadow] duration-(--dur-hover)",
                collapsing && "max-lg:mx-auto max-lg:w-[42px] max-lg:justify-center max-lg:px-0",
                active
                  ? "bg-peach font-semibold text-navy shadow-nav-active"
                  : "text-on-navy-text hover:bg-on-navy-07 hover:text-offwhite",
              )}
            >
              <Glyph aria-hidden size={20} weight="regular" className="shrink-0" />
              <span className={cn(collapsing && "max-lg:sr-only")}>{item.label}</span>
              {hasCount && (
                <span
                  className={cn(
                    "ml-auto grid h-[22px] min-w-6 place-items-center rounded-full px-2 text-[12.5px] font-semibold",
                    collapsing && "max-lg:hidden",
                    active ? "bg-navy text-offwhite" : "bg-peach/18 text-peach",
                  )}
                >
                  {count}
                </span>
              )}
            </Link>
          );
          return (
            <li key={item.href}>
              {collapsing ? (
                <Tooltip>
                  <TooltipTrigger render={link} />
                  <TooltipContent side="right" sideOffset={10} className="lg:hidden">
                    {item.label}
                    {hasCount && <span className="text-ink-muted">{count}</span>}
                  </TooltipContent>
                </Tooltip>
              ) : (
                link
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
