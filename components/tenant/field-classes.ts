/**
 * Class names for the native controls inside tenant forms (a `select`, a datetime field, an `input` that is not the shared
 * `Input`). Same look as components/ui/input.tsx: a tint, no outline, 44 px tall, and 16 px text, because iOS zooms the page
 * when a focused control has smaller text.
 */
export const NATIVE_FIELD =
  "h-11 w-full min-w-0 rounded-sm bg-input px-3.5 text-base text-foreground outline-none transition-[box-shadow,background-color] placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

/** The same for a multi-line `textarea`, which grows with its text and has no fixed height. */
export const NATIVE_TEXTAREA =
  "min-h-24 w-full min-w-0 rounded-sm bg-input px-3.5 py-3 text-base text-foreground outline-none transition-[box-shadow,background-color] placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
