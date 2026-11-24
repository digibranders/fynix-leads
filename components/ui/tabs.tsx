"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

/**
 * Default is the segmented control: a tonal track with a white active segment. "line" is the underline used above tables,
 * with a count beside each label (put the count in a `<b>`).
 */
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center text-ink-2 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "h-(--h-control) gap-0.5 rounded-sm bg-navy-05 p-[3px]",
        line: "h-10 max-w-full gap-1 overflow-x-auto bg-transparent [scrollbar-width:none]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 text-[13px] font-medium whitespace-nowrap text-ink-2 transition-[background-color,color,box-shadow] group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_b]:font-semibold [&_b]:text-ink-muted",
        // segmented
        "group-data-[variant=default]/tabs-list:h-7 group-data-[variant=default]/tabs-list:flex-1 group-data-[variant=default]/tabs-list:rounded-xs group-data-[variant=default]/tabs-list:px-3 group-data-[variant=default]/tabs-list:hover:text-ink group-data-[variant=default]/tabs-list:data-active:bg-surface group-data-[variant=default]/tabs-list:data-active:font-semibold group-data-[variant=default]/tabs-list:data-active:text-ink group-data-[variant=default]/tabs-list:data-active:shadow-segment max-md:group-data-[variant=default]/tabs-list:h-9",
        // underline
        "group-data-[variant=line]/tabs-list:h-10 group-data-[variant=line]/tabs-list:flex-none group-data-[variant=line]/tabs-list:rounded-xs group-data-[variant=line]/tabs-list:px-2.5 group-data-[variant=line]/tabs-list:font-semibold group-data-[variant=line]/tabs-list:text-ink-muted group-data-[variant=line]/tabs-list:hover:text-ink group-data-[variant=line]/tabs-list:data-active:text-ink group-data-[variant=line]/tabs-list:data-active:[&_b]:text-ink",
        "group-data-[variant=line]/tabs-list:after:absolute group-data-[variant=line]/tabs-list:after:inset-x-2.5 group-data-[variant=line]/tabs-list:after:bottom-0 group-data-[variant=line]/tabs-list:after:h-0.5 group-data-[variant=line]/tabs-list:after:rounded-full group-data-[variant=line]/tabs-list:after:bg-peach group-data-[variant=line]/tabs-list:after:opacity-0 group-data-[variant=line]/tabs-list:after:transition-opacity group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
