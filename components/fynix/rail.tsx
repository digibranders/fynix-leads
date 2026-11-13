"use client";

import { Funnel } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { FYNIX_NAV, isCurrent } from "./nav-config";

type Props = {
  /** True for the floating rail: below `lg` it shrinks to icons. The phone sheet always shows everything. */
  collapsing?: boolean;
  onNavigate?: () => void;
  /** The signed-in person and the way out, drawn on the server. */
  footer: React.ReactNode;
};

const ITEM = "flex h-[42px] items-center gap-[11px] rounded-full px-3.5 text-[14px] font-medium outline-offwhite";

/** The navy rail's content, shared by the floating rail and the phone sheet. */
export function FynixRail({ collapsing = false, onNavigate, footer }: Props) {
  const pathname = usePathname();
  const collapse = collapsing && "max-lg:mx-auto max-lg:w-[42px] max-lg:justify-center max-lg:px-0";

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 pt-5 pb-3 text-offwhite">
      <div className={cn("mb-2.5 flex shrink-0 items-center gap-2.5 px-2 pb-[18px] shadow-[inset_0_-1px_0_var(--on-navy-07)]", collapsing && "max-lg:justify-center max-lg:px-0")}>
        <Link href="/fynix/suppliers" aria-label="Fynix Leads" onClick={onNavigate} className="flex items-center gap-2.5 rounded-sm outline-offwhite">
          <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-peach text-navy">
            <Funnel aria-hidden weight="fill" size={19} />
          </span>
          <span className={cn("text-base font-semibold tracking-[-0.01em]", collapsing && "max-lg:hidden")}>Fynix Leads</span>
        </Link>
      </div>

      <nav aria-label="Main" className="-mx-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1 [scrollbar-width:none]">
        <ul className="flex flex-col gap-1">
          {FYNIX_NAV.map((item) => {
            const Glyph = item.icon;
            if (item.href === null) {
              // Not built yet: said plainly, and not a link, so nobody lands on an empty page.
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
                aria-current={active ? "page" : undefined}
                aria-label={collapsing ? item.label : undefined}
                onClick={onNavigate}
                className={cn(
                  ITEM,
                  "transition-[background-color,color,box-shadow] duration-(--dur-hover)",
                  collapse,
                  active ? "bg-peach font-semibold text-navy shadow-nav-active" : "text-on-navy-text hover:bg-on-navy-07 hover:text-offwhite",
                )}
              >
                <Glyph aria-hidden size={20} className="shrink-0" />
                <span className={cn(collapsing && "max-lg:sr-only")}>{item.label}</span>
              </Link>
            );
            return (
              <li key={item.label}>
                {collapsing ? (
                  <Tooltip>
                    <TooltipTrigger render={link} />
                    <TooltipContent side="right" sideOffset={10} className="lg:hidden">
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

      <div className="mt-3 shrink-0">{footer}</div>
    </div>
  );
}
