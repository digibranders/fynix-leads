"use client"

import * as React from "react"
import { cn } from "cn"

/**
 * A data table has no box: a tonal header band, a 6% line between rows, a wash on hover, a peach wash when selected.
 * Rows are 52px so a name and a title fit on two lines without wrapping.
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom border-separate border-spacing-0 text-table", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_th:first-child]:rounded-l-sm [&_th:first-child]:pl-4 [&_th:last-child]:rounded-r-sm [&_th:last-child]:pr-4", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child>td]:shadow-none", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-navy-04 font-medium [&_td:first-child]:rounded-l-sm [&_td:last-child]:rounded-r-sm",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "transition-colors [&>td]:shadow-[inset_0_-1px_0_var(--line)] [&>td:first-child]:pl-4 [&>td:last-child]:pr-4 hover:[&>td]:bg-navy-03 has-aria-expanded:[&>td]:bg-navy-03 data-[state=selected]:[&>td]:bg-selected data-[state=selected]:[&>td]:shadow-none data-[state=selected]:hover:[&>td]:bg-selected data-[state=selected]:[&>td:first-child]:rounded-l-sm data-[state=selected]:[&>td:last-child]:rounded-r-sm",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-9 bg-navy-04 px-2 text-left align-middle text-xs font-semibold whitespace-nowrap text-ink-muted [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "h-[52px] px-2 py-0 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
