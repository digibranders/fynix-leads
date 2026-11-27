"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { TOPBAR_ACTIONS_ID } from "@/components/shell/topbar";
import { cn } from "@/lib/utils";

const noSubscription = () => () => {};

/**
 * The title row on the canvas: no bar, no border. One title, one plain sentence of facts from the data, and the page's actions on
 * the right (at most one primary). Actions wrap under the title on a phone.
 *
 * On a section's own page (`/portal` or `/portal/section`) the top strip already names the page, so from `md` the title and the
 * sentence stay for screen readers only and the actions move into the strip. A record page (a client, a campaign, a lead) keeps its
 * title, because the strip only has the record's id there. Phones keep the large title and the actions under it.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const compact = pathname !== null && pathname.split("/").filter(Boolean).length <= 2;
  const slot = useSyncExternalStore(noSubscription, () => document.getElementById(TOPBAR_ACTIONS_ID), () => null);
  const hidden = compact && "md:sr-only";

  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pb-1", compact && "md:pb-0", className)}>
      <div className={cn("min-w-0 basis-full md:basis-0 md:flex-1", hidden)}>
        <h1 className="text-title font-semibold tracking-title text-balance text-ink">{title}</h1>
        {description ? <p className="mt-0.5 text-body text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className={cn("flex flex-wrap items-center gap-2", compact && "md:hidden")}>{actions}</div> : null}
      {compact && actions && slot !== null ? createPortal(actions, slot) : null}
    </header>
  );
}
