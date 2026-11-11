"use client"

import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/** Chip pill: a soft tint with coloured text, never an outline. Pair a status colour with an icon and a label. */
const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center overflow-hidden rounded-full leading-none font-semibold whitespace-nowrap transition-colors [&>svg]:pointer-events-none",
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
      },
      size: {
        default: "h-[26px] gap-1.5 pr-[11px] pl-2 text-[12.5px] [&>svg]:size-[15px]",
        lg: "h-[30px] gap-1.5 pr-[13px] pl-2.5 text-[13px] [&>svg]:size-[17px]",
        sm: "h-[22px] gap-1 pr-[9px] pl-1.5 text-xs font-medium [&>svg]:size-[13px]",
      },
    },
    compoundVariants: [
      // Table chips are smaller and softer: the status solid at low alpha instead of the soft fill.
      { size: "sm", variant: "amber", className: "bg-amber-solid/14" },
      { size: "sm", variant: "green", className: "bg-green-solid/12" },
      { size: "sm", variant: "red", className: "bg-red-solid/11" },
      { size: "sm", variant: "blue", className: "bg-blue-solid/12" },
    ],
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
