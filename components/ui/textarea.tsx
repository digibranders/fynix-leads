import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-sm bg-input px-3.5 py-3 text-base text-foreground transition-[box-shadow,background-color] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:bg-red-soft aria-invalid:ring-2 aria-invalid:ring-red-solid md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
