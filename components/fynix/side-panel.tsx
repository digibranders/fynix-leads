import { X } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  /** The page without the selection: the close button and the scrim go here. */
  closeHref: string;
  /** What the panel is, for a screen reader. */
  label: string;
  /** The chips and the title at the top. */
  header: React.ReactNode;
  children: React.ReactNode;
  /** The pinned action row. Left out for staff, who have no actions. */
  footer?: React.ReactNode;
};

/**
 * The selection panel, chosen by the URL. From `xl` it is the second column of the page; from `md` to `xl` it floats over the
 * page on the right; below `md` it is a bottom sheet. All three are one element and the layout is CSS only, so the close
 * button and the scrim are plain links that drop the selection from the address.
 */
export function SidePanel({ closeHref, label, header, children, footer }: Props) {
  return (
    <>
      <Link href={closeHref} scroll={false} aria-label="Close panel" tabIndex={-1} className="fixed inset-0 z-40 bg-scrim xl:hidden" />
      <aside
        aria-label={label}
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden bg-surface shadow-popover",
          "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-xl",
          "md:inset-y-3 md:right-3 md:left-auto md:max-h-none md:w-[400px] md:rounded-xl",
          "xl:sticky xl:top-5 xl:z-auto xl:inset-auto xl:max-h-[calc(100dvh-40px)] xl:w-auto xl:rounded-lg xl:shadow-raised",
        )}
      >
        <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-navy-10 md:hidden" />
        <div className="flex shrink-0 items-start gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0 flex-1">{header}</div>
          <Link
            href={closeHref}
            scroll={false}
            aria-label="Close panel"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-navy-05 text-ink transition-colors duration-(--dur-hover) hover:bg-navy-10"
          >
            <X aria-hidden size={18} />
          </Link>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap gap-2.5 bg-surface px-4 py-3.5 shadow-tray">{footer}</div>}
      </aside>
    </>
  );
}
