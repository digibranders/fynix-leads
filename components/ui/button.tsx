import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/**
 * One primary action per surface. Secondary is a tonal fill (no outline). Destructive is a quiet red tint, never a solid red block.
 * `peach` and `onNavy` exist for the hero card and the sidebar, the only places a button sits on navy.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-sm font-semibold whitespace-nowrap transition-[transform,background-color,box-shadow,color] duration-(--dur-press) select-none active:not-aria-[haspopup]:scale-(--press-scale) disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-btn-primary hover:bg-navy-hover [&_kbd]:bg-on-navy-16 [&_kbd]:text-offwhite",
        secondary:
          "bg-navy-05 text-foreground hover:bg-navy-08 aria-expanded:bg-navy-08 [&_kbd]:bg-navy-08 [&_kbd]:text-ink-2",
        destructive:
          "bg-red-soft text-red-text hover:bg-red-soft-hover [&_kbd]:bg-red-text/12 [&_kbd]:text-red-text",
        ghost: "text-foreground hover:bg-navy-05 aria-expanded:bg-navy-05",
        "ghost-destructive": "text-red-text hover:bg-red-soft aria-expanded:bg-red-soft",
        link: "rounded-xs text-primary underline-offset-4 hover:underline",
        peach: "bg-peach text-navy shadow-btn-peach hover:brightness-105",
        onNavy: "bg-on-navy-10 text-offwhite hover:bg-on-navy-16",
      },
      size: {
        default:
          "h-(--h-control) gap-2 px-3.5 text-[13px] has-[kbd]:pr-2 has-[kbd]:pl-3 [&_svg:not([class*='size-'])]:size-4",
        sm: "h-(--h-control-sm) max-md:h-10 gap-1.5 px-3 text-[13px] has-[kbd]:pr-1.5 [&_svg:not([class*='size-'])]:size-[15px]",
        xs: "h-(--h-control-xs) max-md:h-10 gap-1.5 px-2.5 text-xs has-[kbd]:pr-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-(--h-control-lg) gap-2 px-[18px] text-sm [&_svg:not([class*='size-'])]:size-[17px]",
        icon: "size-(--h-control) max-md:size-10 [&_svg:not([class*='size-'])]:size-[17px]",
        "icon-sm": "size-(--h-control-sm) max-md:size-10 [&_svg:not([class*='size-'])]:size-4",
        "icon-xs": "size-(--h-control-xs) max-md:size-10 [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
