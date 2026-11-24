"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckCircleIcon, InfoIcon, WarningIcon, XCircleIcon, SpinnerIcon } from "@phosphor-icons/react"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: (
          <CheckCircleIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <WarningIcon className="size-4" />
        ),
        error: (
          <XCircleIcon className="size-4" />
        ),
        loading: (
          <SpinnerIcon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "transparent",
          "--border-radius": "var(--radius-md)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast border-0! shadow-popover! font-sans",
          title: "font-semibold",
          actionButton:
            "h-8! max-md:h-10! rounded-sm! bg-navy-07! px-3.5! text-[13px]! font-semibold! text-foreground! hover:bg-navy-10!",
          cancelButton:
            "h-8! max-md:h-10! rounded-sm! bg-transparent! px-3.5! text-[13px]! font-semibold! text-ink-2!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
