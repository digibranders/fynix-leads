"use client";

import { BellSimple } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { NoticeView } from "@/lib/leads/notice-display";
import { formatBadge } from "@/lib/shell/badge";
import { loadNoticesAction, markAllNoticesReadAction, markNoticeReadAction } from "@/server/domain/notice-actions";
import { NoticeList } from "./notice-list";

interface Props {
  /** Where "See all" goes: the portal's Notices page. */
  readonly seeAllHref: string;
  /** Unread notices, counted by the server in the layout. Message notices are counted by the Messages badge, not here. */
  readonly unread: number;
}

/** Loads the latest notices each time the panel opens, so the list is never older than the click. */
function useNotices(open: boolean) {
  const [notices, setNotices] = useState<readonly NoticeView[] | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!open) return;
    let live = true;
    void loadNoticesAction().then((rows) => {
      if (!live) return;
      setNow(new Date());
      setNotices(rows);
    });
    return () => {
      live = false;
    };
  }, [open]);
  return { notices, now, markAllLocally: () => setNotices((rows) => rows?.map((row) => ({ ...row, read: true })) ?? rows), markLocally: (id: string) => setNotices((rows) => rows?.map((row) => (row.id === id ? { ...row, read: true } : row)) ?? rows) };
}

/** The panel body: a header with "Mark all read", the list, and "See all". The same in the popover and in the phone sheet. */
function Panel({ open, seeAllHref, close }: { readonly open: boolean; readonly seeAllHref: string; readonly close: () => void }) {
  const router = useRouter();
  const { notices, now, markAllLocally, markLocally } = useNotices(open);
  const [pending, startTransition] = useTransition();
  const anyUnread = notices?.some((row) => !row.read) ?? false;

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-3 px-3 pt-1">
        <h2 className="text-section font-semibold tracking-[-0.01em] text-ink">Notices</h2>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={pending || !anyUnread}
          onClick={() =>
            startTransition(async () => {
              await markAllNoticesReadAction();
              markAllLocally();
              router.refresh();
            })
          }
        >
          Mark all read
        </Button>
      </div>
      <div className="max-h-[min(420px,60dvh)] min-h-16 overflow-y-auto overscroll-contain px-1">
        {notices === null ? (
          <p className="px-6 py-10 text-center text-table text-ink-muted">Loading</p>
        ) : (
          <NoticeList
            notices={notices}
            now={now}
            onOpen={(notice) => {
              markLocally(notice.id);
              close();
              void markNoticeReadAction(notice.id);
            }}
          />
        )}
      </div>
      <Link href={seeAllHref} onClick={close} className={buttonVariants({ variant: "ghost", size: "sm", className: "mx-1 mb-1" })}>
        See all
      </Link>
    </div>
  );
}

function BellFace({ unread }: { readonly unread: number }) {
  return (
    <>
      <BellSimple aria-hidden size={16} weight={unread > 0 ? "fill" : "regular"} />
      {unread > 0 ? (
        <b aria-hidden className="absolute -top-1.5 -right-1.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-peach px-1 text-[10.5px] font-extrabold text-navy shadow-[0_0_0_2px_var(--canvas)]">
          {formatBadge(unread)}
        </b>
      ) : null}
    </>
  );
}

/**
 * The bell in the top bar. From `md` it opens a popover under the bell; on a phone, the same list in a bottom sheet. Both triggers are in the page and CSS
 * shows one of them, so the layout never depends on JavaScript.
 */
export function NoticeBell({ seeAllHref, unread }: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const label = unread > 0 ? `Notices, ${formatBadge(unread)} unread` : "Notices";

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger
          aria-label={label}
          className="relative grid h-(--h-control) w-(--h-control) shrink-0 place-items-center rounded-sm bg-navy-05 text-ink-2 transition-colors hover:bg-navy-08 hover:text-ink max-md:hidden"
        >
          <BellFace unread={unread} />
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="w-[min(400px,calc(100vw-2rem))] gap-0 p-2">
          <Panel open={popoverOpen} seeAllHref={seeAllHref} close={() => setPopoverOpen(false)} />
        </PopoverContent>
      </Popover>

      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={() => setSheetOpen(true)}
        className="relative grid size-9 shrink-0 place-items-center rounded-[12px] bg-surface text-ink-2 shadow-raised md:hidden"
      >
        <BellFace unread={unread} />
      </button>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="end" className="gap-0 p-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] md:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Notices</SheetTitle>
            <SheetDescription>What happened on your leads and campaigns.</SheetDescription>
          </SheetHeader>
          <Panel open={sheetOpen} seeAllHref={seeAllHref} close={() => setSheetOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
