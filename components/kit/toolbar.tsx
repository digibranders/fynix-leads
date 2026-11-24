import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { CONTROL } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** The row above a table: filters on the left, the shown count on the right. Wraps on a phone. */
export function Toolbar({ children, trailing, className }: { children: React.ReactNode; trailing?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 px-5 py-3", className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {trailing ? <div className="text-label text-ink-muted">{trailing}</div> : null}
    </div>
  );
}

/**
 * A search that is a plain GET form: it sets `q` in the URL, so the server filters and the page works without script.
 * `hidden` carries the other filters that must survive a new search (the stage, the page size).
 */
export function SearchForm({
  defaultValue,
  placeholder,
  hidden,
  className,
}: {
  defaultValue?: string;
  placeholder: string;
  hidden?: Readonly<Record<string, string | undefined>>;
  className?: string;
}) {
  return (
    <form role="search" className={cn("relative w-full md:w-[320px]", className)}>
      {Object.entries(hidden ?? {}).map(([name, value]) => (value ? <input key={name} type="hidden" name={name} value={value} /> : null))}
      <MagnifyingGlass aria-hidden size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(CONTROL, "h-(--h-control) w-full rounded-sm pr-3 pl-9 text-[16px] placeholder:text-ink-muted md:text-[13.5px]")}
      />
    </form>
  );
}
