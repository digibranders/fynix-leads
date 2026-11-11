"use client";

import { Check, CaretUpDown } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { initialsOf, ROLE_HOME, ROLE_LABEL, ROLE_PARTY, type Role } from "./nav-config";

const ROLES = Object.keys(ROLE_LABEL) as Role[];

type Props = {
  role: Role;
  /** Runs when the person picks a view, so the mobile sheet can close. */
  onNavigate?: () => void;
  /** From `md` to `lg` the well shrinks to the avatar and the prototype note moves into the menu. */
  collapsing?: boolean;
  className?: string;
};

/** Prototype only: switches between the two roles that exist in Phase 0. */
export function RoleSwitcher({ role, onNavigate, collapsing = false, className }: Props) {
  const router = useRouter();
  const party = ROLE_PARTY[role];

  return (
    <div className={className}>
      <p className={cn("px-1.5 pb-2 text-xs font-medium text-on-navy-muted", collapsing && "max-lg:sr-only")}>
        Viewing as
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Viewing as ${party}, ${ROLE_LABEL[role]}. Switch view`}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md bg-on-navy-07 p-[11px] text-left text-offwhite outline-offwhite transition-colors duration-(--dur-hover) hover:bg-on-navy-10 aria-expanded:bg-on-navy-10",
            collapsing && "max-lg:mx-auto max-lg:size-12 max-lg:justify-center max-lg:rounded-full max-lg:p-0",
          )}
        >
          <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-peach text-[12.5px] font-semibold text-navy">
            {initialsOf(party)}
          </span>
          <span className={cn("min-w-0 flex-1", collapsing && "max-lg:hidden")}>
            <span className="block truncate text-[13.5px] leading-[17px] font-semibold">{party}</span>
            <span className="block text-[12.5px] leading-4 text-on-navy-text">{ROLE_LABEL[role]}</span>
          </span>
          <CaretUpDown aria-hidden size={16} className={cn("shrink-0 text-on-navy-text", collapsing && "max-lg:hidden")} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Switch view</DropdownMenuLabel>
            {ROLES.map((option) => (
              <DropdownMenuItem
                key={option}
                aria-current={option === role ? "true" : undefined}
                onClick={() => {
                  if (option === role) return;
                  onNavigate?.();
                  router.push(ROLE_HOME[option]);
                }}
                className="min-h-11 gap-3"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-navy-07 text-xs font-semibold">
                  {initialsOf(ROLE_PARTY[option])}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-[18px] font-medium">{ROLE_LABEL[option]}</span>
                  <span className="block truncate text-xs leading-4 text-muted-foreground">{ROLE_PARTY[option]}</span>
                </span>
                {option === role && <Check aria-hidden weight="bold" className="size-4 text-ink" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {collapsing && (
            <p className="px-2.5 pt-1.5 pb-1 text-xs text-muted-foreground lg:hidden">
              Prototype with sample data. Nothing is saved.
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
