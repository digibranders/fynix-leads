import { cn } from "@/lib/utils";

/** A white raised panel. `@container` lets the content adapt to the card's width, not the window's. */
export function Card({ className, children, ...rest }: React.ComponentProps<"section">) {
  return (
    <section {...rest} className={cn("@container min-w-0 overflow-hidden rounded-lg bg-surface shadow-raised", className)}>
      {children}
    </section>
  );
}

/** A soft tonal block inside a card or the side panel. */
export function Tonal({ className, children, ...rest }: React.ComponentProps<"section">) {
  return (
    <section {...rest} className={cn("rounded-md bg-tonal p-4", className)}>
      {children}
    </section>
  );
}
