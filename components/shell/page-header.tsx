"use client";

import { usePathname } from "next/navigation";
import { CommandSearch } from "./command-search";
import { MobileNav } from "./mobile-nav";
import { initialsOf, ROLE_LABEL, ROLE_PARTY, roleFromPath } from "./nav-config";
import { Notifications } from "./notifications";

type Props = {
  title: string;
  /** Facts from the data only, never marketing copy. */
  subtitle?: string;
  /** Page buttons. They sit to the left of the search, bell and avatar. */
  actions?: React.ReactNode;
};

/** The title row on the canvas: no bar, no border. Every page renders one at the top. */
export function PageHeader({ title, subtitle, actions }: Props) {
  const role = roleFromPath(usePathname());
  const party = ROLE_PARTY[role];

  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 pb-4">
      <MobileNav className="md:hidden" />

      <div className="order-3 min-w-0 basis-full md:order-none md:basis-0 md:flex-1">
        <h1 className="text-title font-semibold tracking-title text-balance text-ink">{title}</h1>
        {subtitle && <p className="mt-[3px] text-body text-ink-2">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2.5 max-md:ml-auto">
        {actions}
        <CommandSearch role={role} />
        <Notifications />
        <span
          role="img"
          aria-label={`${party}, ${ROLE_LABEL[role]}`}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-navy text-[13px] font-semibold text-offwhite select-none"
        >
          {initialsOf(party)}
        </span>
      </div>
    </header>
  );
}
