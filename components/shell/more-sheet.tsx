"use client";

import { Dialog } from "@base-ui/react/dialog";
import { CaretRight, MagnifyingGlass } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { GLYPHS } from "./sidebar";
import type { NavGroup } from "./nav";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: readonly NavGroup[];
  counts: Readonly<Record<string, number>>;
  /** The signed-in person and sign-out, rendered on the server. */
  footer: ReactNode;
  onSearch: () => void;
}

/** Past this many pixels of travel, or this speed (px per ms), a release closes the sheet instead of springing it back. */
const CLOSE_DISTANCE_RATIO = 0.26;
const CLOSE_VELOCITY = 0.55;
/** A finger must move this far, mostly up or down, before a touch becomes a drag. A tap on a row never gets there. */
const DRAG_SLOP = 7;

const root = (): HTMLElement => document.documentElement;

/**
 * The More sheet, built to move like an iOS sheet: it rises on a spring, follows a finger down with rubber-banding upward, closes on
 * distance or flick speed and otherwise springs back. The scrim and the page behind it follow the drag through `--sheet-p`, so the
 * whole scene moves as one. Motion values are written to the DOM directly: no React state changes while a finger is down.
 */
export function MoreSheet({ open, onOpenChange, groups, counts, footer, onSearch }: Props) {
  const popupRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x0: number; y0: number; lastY: number; lastT: number; velocity: number; dragging: boolean; offset: number } | null>(null);
  const swallowClick = useRef(false);

  // While the sheet is up, the page behind it sinks back. The origin and the clip are the visible part of the page, wherever it is scrolled to.
  useEffect(() => {
    if (!open) return;
    const html = root();
    html.style.setProperty("--sheet-top", `${window.scrollY}px`);
    html.style.setProperty("--sheet-origin", `${window.scrollY + window.innerHeight / 2}px`);
    html.style.setProperty("--sheet-p", "1");
    html.dataset.sheet = "";
    return () => {
      delete html.dataset.sheet;
      delete html.dataset.sheetDrag;
      html.style.removeProperty("--sheet-top");
      html.style.removeProperty("--sheet-origin");
      html.style.removeProperty("--sheet-p");
    };
  }, [open]);

  function follow(progress: number): void {
    root().style.setProperty("--sheet-p", String(progress));
    if (scrimRef.current) scrimRef.current.style.opacity = String(progress);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // A scrolled list scrolls; only a list at its top hands the gesture to the sheet.
    if ((bodyRef.current?.scrollTop ?? 0) > 0) return;
    touch.current = { x0: event.clientX, y0: event.clientY, lastY: event.clientY, lastT: event.timeStamp, velocity: 0, dragging: false, offset: 0 };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const state = touch.current;
    const popup = popupRef.current;
    if (state === null || popup === null) return;
    const dy = event.clientY - state.y0;
    if (!state.dragging) {
      if (Math.abs(dy) < DRAG_SLOP || Math.abs(dy) < Math.abs(event.clientX - state.x0)) return;
      state.dragging = true;
      popup.setPointerCapture(event.pointerId);
      popup.style.transition = "none";
      if (scrimRef.current) scrimRef.current.style.transition = "none";
      root().dataset.sheetDrag = "";
    }
    // Pulling up meets resistance, the way a sheet does when it is already fully open.
    const offset = dy >= 0 ? dy : -Math.sqrt(-dy) * 2.6;
    state.offset = offset;
    const dt = Math.max(event.timeStamp - state.lastT, 1);
    state.velocity = 0.8 * state.velocity + 0.2 * ((event.clientY - state.lastY) / dt);
    state.lastY = event.clientY;
    state.lastT = event.timeStamp;
    popup.style.transform = `translateY(${offset}px)`;
    follow(Math.max(0, 1 - Math.max(offset, 0) / popup.offsetHeight));
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    const state = touch.current;
    const popup = popupRef.current;
    touch.current = null;
    if (state === null || popup === null || !state.dragging) return;
    popup.releasePointerCapture(event.pointerId);
    delete root().dataset.sheetDrag;
    swallowClick.current = true; // the lift of a drag that began on a row must not follow that row's link
    const closes = state.offset > popup.offsetHeight * CLOSE_DISTANCE_RATIO || state.velocity > CLOSE_VELOCITY;
    if (closes) {
      popup.style.transition = "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)";
      popup.style.transform = "translateY(100%)";
      if (scrimRef.current) {
        scrimRef.current.style.transition = "opacity 320ms cubic-bezier(0.32, 0.72, 0, 1)";
        scrimRef.current.style.opacity = "0";
      }
      follow(0);
      onOpenChange(false);
      return;
    }
    popup.style.transition = "transform var(--dur-sheet) var(--ease-sheet)";
    popup.style.transform = "translateY(0)";
    if (scrimRef.current) {
      scrimRef.current.style.transition = "opacity var(--dur-sheet) var(--ease-sheet)";
      scrimRef.current.style.opacity = "1";
    }
    follow(1);
    popup.addEventListener(
      "transitionend",
      () => {
        popup.style.transition = "";
        popup.style.transform = "";
        if (scrimRef.current) {
          scrimRef.current.style.transition = "";
          scrimRef.current.style.opacity = "";
        }
      },
      { once: true },
    );
  }

  let row = 0;
  const stagger = (): CSSProperties => ({ "--i": row++ }) as CSSProperties;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop ref={scrimRef} className="sheet-scrim fixed inset-0 z-[55] md:hidden" />
        <Dialog.Popup
          ref={popupRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClickCapture={(event) => {
            if (!swallowClick.current) return;
            swallowClick.current = false;
            event.preventDefault();
            event.stopPropagation();
          }}
          className="sheet-ink glass-sheet fixed inset-x-0 bottom-0 z-[56] flex max-h-[88dvh] touch-pan-x flex-col rounded-t-[34px] pt-2.5 text-offwhite outline-none md:hidden"
        >
          <Dialog.Title className="sr-only">Menu</Dialog.Title>
          <Dialog.Description className="sr-only">Every page of the portal that is not on the tab bar.</Dialog.Description>
          <span aria-hidden className="mx-auto mb-3 block h-[5px] w-10 shrink-0 rounded-full bg-offwhite/30" />
          <div
            ref={bodyRef}
            className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] [scrollbar-width:none]"
          >
            <button
              type="button"
              onClick={onSearch}
              style={stagger()}
              className="sheet-row sheet-press mb-2 flex h-11 items-center gap-2.5 rounded-[14px] bg-offwhite/10 px-3.5 text-left text-[15px] text-offwhite/65"
            >
              <MagnifyingGlass aria-hidden size={17} />
              Search pages
            </button>

            <div style={stagger()} className="sheet-row mb-1 rounded-[20px] bg-offwhite/[0.08] p-1.5">
              {footer}
            </div>

            {groups.map((group, index) => (
              <section key={group.label ?? index} className="flex flex-col">
                {group.label ? (
                  <h2 style={stagger()} className="sheet-row px-1.5 pt-4 pb-2 text-[12.5px] font-semibold text-offwhite/60">
                    {group.label}
                  </h2>
                ) : null}
                <ul className="overflow-hidden rounded-[20px] bg-offwhite/[0.08]">
                  {group.items.map((item) => {
                    const Glyph = GLYPHS[item.icon];
                    const count = item.countKey ? (counts[item.countKey] ?? 0) : 0;
                    return (
                      <li key={item.href} style={stagger()} className="sheet-row [&+li]:shadow-[inset_0_1px_0_rgb(255_255_255/0.09)]">
                        <Link
                          href={item.href}
                          onClick={() => onOpenChange(false)}
                          className="sheet-press flex h-14 items-center gap-3.5 px-3.5 outline-offset-[-2px] outline-offwhite active:bg-offwhite/10"
                        >
                          <span aria-hidden className="grid size-[34px] shrink-0 place-items-center rounded-[11px] bg-peach/15 text-peach">
                            <Glyph size={19} weight="fill" />
                          </span>
                          <span className="flex-1 text-[16px] font-semibold tracking-[-0.01em]">{item.label}</span>
                          {count > 0 ? (
                            <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-peach px-1.5 text-[12px] font-bold text-navy">{count}</span>
                          ) : null}
                          <CaretRight aria-hidden size={15} weight="bold" className="text-offwhite/40" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
