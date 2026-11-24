"use client"

import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/**
 * A status chip: a soft tint with coloured text, never an outline. 6px corners, the same at every size.
 * Colour is status only; pair it with a label (and an icon where the chip is the only cue).
 */
const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center overflow-hidden rounded-xs leading-none font-semibold whitespace-nowrap transition-colors [&>svg]:pointer-events-none",
  {
    variants: {
      variant: {
        neutral: "bg-navy-07 text-ink",
        quiet: "bg-navy-05 text-ink-2",
        solid: "bg-primary text-primary-foreground",
        amber: "bg-amber-soft text-amber-text",
        green: "bg-green-soft text-green-text",
        red: "bg-red-soft text-red-text",
        blue: "bg-blue-soft text-blue-text",
        teal: "bg-teal-soft text-teal-text",
        peach: "bg-selected text-peach-deep",
      },
      size: {
        default: "h-6 gap-1.5 px-2 text-xs [&>svg]:size-3.5",
        lg: "h-7 gap-1.5 px-2.5 text-[13px] [&>svg]:size-4",
        sm: "h-5 gap-1 px-1.5 text-[11.5px] [&>svg]:size-3",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "default",
    },
  }
)

function Badge({
  className,
  variant = "neutral",
  size = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant, size }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
      size,
    },
  })
}

export { Badge, badgeVariants }
