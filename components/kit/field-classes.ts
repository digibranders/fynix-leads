import { CONTROL } from "@/components/ui/input";

/**
 * Class names for the native controls inside tenant forms (a `select`, a datetime field, an `input` that is not the shared `Input`).
 * Same look as components/ui/input.tsx: a tonal fill, a 3:1 edge, 16 px text on a phone because iOS zooms the page when a focused
 * control has smaller text.
 */
export const NATIVE_FIELD = `${CONTROL} h-(--h-control) w-full min-w-0 rounded-sm px-3 text-base text-foreground placeholder:text-ink-muted md:text-[13.5px]`;

/** The same for a multi-line `textarea`, which grows with its text and has no fixed height. */
export const NATIVE_TEXTAREA = `${CONTROL} min-h-24 w-full min-w-0 rounded-sm px-3 py-2.5 text-base text-foreground placeholder:text-ink-muted md:text-[13.5px]`;
