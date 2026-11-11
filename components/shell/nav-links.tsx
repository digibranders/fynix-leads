"use client";

import Link from "next/link";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isActive, NAV, type Role } from "./nav-config";

type Props = {
  role: Role;
  pathname: string;
  /** Icon-only below `lg`, with a tooltip. Used by the sidebar rail. */
  collapsible?: boolean;
  onNavigate?: () => void;
};

export function NavLinks({ role, pathname, collapsible = false, onNavigate }: Props) {
  return (
    <nav aria-label="Main">
      <ul className="flex flex-col gap-0.5">
        {NAV[role].map((item) => {
          const active = isActive(item, pathname);
          const Glyph = item.icon;
          const link = (
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={collapsible ? item.label : undefined}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-md text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                collapsible
                  ? "mx-auto size-9 justify-center lg:size-auto lg:h-9 lg:justify-start lg:px-2.5"
                  : "h-10 px-2.5",
                active
                  ? "bg-sidebar-accent font-medium text-primary"
                  : "text-sidebar-foreground hover:bg-[var(--gray-3)] hover:text-foreground",
              )}
            >
              <Glyph aria-hidden size={18} weight="regular" className="shrink-0" />
              <span className={cn(collapsible && "hidden lg:inline")}>{item.label}</span>
            </Link>
          );
          return (
            <li key={item.href}>
              {collapsible ? (
                <Tooltip>
                  <TooltipTrigger render={link} />
                  <TooltipContent side="right" className="lg:hidden">
                    {item.label}
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
