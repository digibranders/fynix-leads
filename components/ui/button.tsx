import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full text-sm font-semibold whitespace-nowrap transition-[transform,background-color,box-shadow] duration-(--dur-press) select-none active:not-aria-[haspopup]:scale-(--press-scale) disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-btn-primary hover:bg-navy-hover [&_kbd]:bg-white/16 [&_kbd]:text-offwhite",
        secondary:
          "bg-navy-07 text-foreground hover:bg-navy-10 aria-expanded:bg-navy-10 [&_kbd]:bg-navy-08 [&_kbd]:text-ink-2",
        destructive:
          "bg-red-soft text-red-text hover:bg-red-soft-hover [&_kbd]:bg-red-text/12 [&_kbd]:text-red-text",
        ghost: "text-foreground hover:bg-navy-07 aria-expanded:bg-navy-07",
        link: "rounded-xs text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-11 gap-2 px-[18px] has-[kbd]:pr-[9px] has-[kbd]:pl-4 [&_svg:not([class*='size-'])]:size-[18px]",
        sm: "h-8 gap-[7px] px-3.5 text-[13px] has-[kbd]:pr-2 [&_svg:not([class*='size-'])]:size-4",
        xs: "h-7 gap-1.5 px-3 text-xs has-[kbd]:pr-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        icon: "size-10 [&_svg:not([class*='size-'])]:size-5",
        "icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-4",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
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
