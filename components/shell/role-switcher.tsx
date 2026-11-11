"use client";

import { useId } from "react";
import { UserSwitch } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ROLE_HOME, ROLE_LABEL, type Role } from "./nav-config";

const ITEMS = (Object.keys(ROLE_LABEL) as Role[]).map((role) => ({ value: role, label: ROLE_LABEL[role] }));

type Props = { role: Role; compact?: boolean; className?: string };

/** Prototype only: switches between the two roles that exist in Phase 0. */
export function RoleSwitcher({ role, compact = false, className }: Props) {
  const router = useRouter();
  const id = useId();
  const select = (
    <Select
      items={ITEMS}
      value={role}
      onValueChange={(next) => {
        if (next && next !== role) router.push(ROLE_HOME[next as Role]);
      }}
    >
      {compact ? (
        <SelectTrigger
          id={id}
          aria-label={`Viewing as ${ROLE_LABEL[role]}`}
          title={`Viewing as ${ROLE_LABEL[role]}. Prototype with sample data. Nothing is saved.`}
          className="mx-auto size-9 justify-center bg-card p-0 [&>svg:last-child]:hidden"
        >
          <UserSwitch aria-hidden className="size-[18px] text-sidebar-foreground" />
        </SelectTrigger>
      ) : (
        <SelectTrigger id={id} className="w-full bg-card">
          <SelectValue />
        </SelectTrigger>
      )}
      <SelectContent alignItemWithTrigger={false} className={compact ? "w-36" : undefined}>
        {ITEMS.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (compact) return <div className={className}>{select}</div>;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        Viewing as
      </Label>
      {select}
    </div>
  );
}
