"use client";

import type { ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** A styled tooltip on one element, in place of the browser's `title` bubble. The element keeps its own accessible name. */
export function Hint({ label, side = "top", children }: { readonly label: string; readonly side?: "top" | "bottom" | "left" | "right"; readonly children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
