import * as React from "react"
import { cn } from "cn"
import { CONTROL } from "./input"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        CONTROL,
        "flex field-sizing-content min-h-20 w-full rounded-sm px-3 py-2.5 text-[16px] text-foreground placeholder:text-ink-muted md:text-[13.5px]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
