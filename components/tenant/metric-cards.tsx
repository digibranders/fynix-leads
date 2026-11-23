import type React from "react";
import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export interface TenantKpiCardProps {
  readonly title: string;
  readonly value: string | number;
  readonly subtitle?: React.ReactNode;
  readonly icon?: Icon;
  readonly tone?: "default" | "emerald" | "amber" | "rose";
}

const TONE_CLASSES = {
  default: "bg-navy-07 text-ink-2",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-red-soft text-red-text",
};

/**
 * Standard KPI metric card used across Client, Supplier, and Agency overviews.
 */
export function TenantKpiCard({
  title,
  value,
  subtitle,
  icon: Glyph,
  tone = "default",
}: TenantKpiCardProps) {
  return (
    <div className="flex flex-col justify-between rounded-lg bg-surface p-5 shadow-raised ">
      <div className="flex items-start justify-between gap-3">
        <p className="text-body text-ink-2 font-medium">{title}</p>
        {Glyph && (
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", TONE_CLASSES[tone])}>
            <Glyph size={18} weight="fill" />
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold tracking-tight text-ink">{value}</p>
        {subtitle && <p className="mt-1 text-xs text-ink-2">{subtitle}</p>}
      </div>
    </div>
  );
}

export function TenantKpiGrid({ children }: { readonly children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}
