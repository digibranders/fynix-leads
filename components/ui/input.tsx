import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

/**
 * The one place a line is drawn: a tonal fill with a 3:1 edge (WCAG 1.4.11). Focus thickens the edge to navy, an error turns it red.
 * The edge is an inset ring, so the box never changes size.
 */
export const CONTROL =
  "bg-input shadow-[inset_0_0_0_1px_var(--ctl-edge)] outline-none transition-[box-shadow,background-color] hover:bg-navy-05 focus-visible:bg-surface focus-visible:shadow-[inset_0_0_0_2px_var(--navy)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:bg-red-soft aria-invalid:shadow-[inset_0_0_0_2px_var(--red-solid)]"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        CONTROL,
        "h-(--h-control) w-full min-w-0 rounded-sm px-3 text-[16px] text-foreground file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-ink-muted md:text-[13.5px]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
