"use client";

import { Funnel } from "@phosphor-icons/react";
import Link from "next/link";
import { SAMPLE_CAMPAIGN } from "@/lib/sample/campaign";
import { formatIsoDay } from "@/lib/time/iso-day";
import { cn } from "@/lib/utils";
import { NavLinks } from "./nav-links";
import type { Role } from "./nav-config";
import { RoleSwitcher } from "./role-switcher";

const PROTOTYPE_NOTE = "Prototype with sample data. Nothing is saved.";
type Props = {
  role: Role;
  pathname: string;
  /** True for the floating rail: below `lg` it shrinks to icons. The mobile sheet always shows everything. */
  collapsing?: boolean;
  onNavigate?: () => void;
};

/** The rail content, shared by the floating rail and the mobile sheet. */
export function RailPanel({ role, pathname, collapsing = false, onNavigate }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 pt-5 pb-3 text-offwhite">
      <div
        className={cn(
          "mb-2.5 flex shrink-0 items-center gap-2.5 px-2 pb-[18px] shadow-[inset_0_-1px_0_var(--on-navy-07)]",
          collapsing && "max-lg:justify-center max-lg:px-0",
        )}
      >
        <Link
          href="/"
          aria-label="Fynix Leads, prototype index"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-sm outline-offwhite"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-peach text-navy">
            <Funnel aria-hidden weight="fill" size={19} />
          </span>
          <span className={cn("text-base font-semibold tracking-[-0.01em]", collapsing && "max-lg:hidden")}>
            Fynix Leads
          </span>
        </Link>
      </div>

      <div className="-mx-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1 [scrollbar-width:none]">
        <NavLinks role={role} pathname={pathname} collapsing={collapsing} onNavigate={onNavigate} />

        <section
          aria-label="Campaign"
          className={cn("mt-5 rounded-md bg-on-navy-05 p-3.5", collapsing && "max-lg:hidden")}
        >
          <p className="mb-1.5 text-xs font-medium text-on-navy-muted">Campaign</p>
          <p className="text-[13.5px] leading-[18px] font-semibold">{SAMPLE_CAMPAIGN.name}</p>
          <p className="mt-[3px] text-[12.5px] leading-[17px] text-on-navy-text">{SAMPLE_CAMPAIGN.brand}</p>
          <div className="mt-2.5 flex flex-col gap-[3px] pt-2.5 text-xs leading-4 text-on-navy-text shadow-[inset_0_1px_0_var(--on-navy-07)]">
            <span className="font-mono text-peach">{SAMPLE_CAMPAIGN.ref}</span>
            <span>
              {formatIsoDay(SAMPLE_CAMPAIGN.startsOn)} to {formatIsoDay(SAMPLE_CAMPAIGN.endsOn)}
            </span>
          </div>
        </section>
      </div>

      <div className="mt-3 shrink-0">
        <RoleSwitcher role={role} collapsing={collapsing} onNavigate={onNavigate} />
        <p className={cn("mt-2.5 px-1.5 text-xs leading-4 text-on-navy-muted", collapsing && "max-lg:hidden")}>
          {PROTOTYPE_NOTE}
        </p>
      </div>
    </div>
  );
}
