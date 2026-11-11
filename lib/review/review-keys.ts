/** The parts of a keyboard event the shortcut rules look at, so the rules run without a DOM. */
export type KeyEventLike = {
  key: string;
  repeat: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  target: { closest: (selector: string) => unknown } | null;
};

const IGNORED_TARGETS = "input, textarea, select, [contenteditable=true], [role=dialog]";

/** True for a plain press of a registered key, outside typing controls and dialogs. */
export function shouldHandleKey(e: KeyEventLike, handledKeys: readonly string[]): boolean {
  // A held key must not approve the whole queue.
  if (e.repeat) return false;
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  if (e.target?.closest(IGNORED_TARGETS)) return false;
  return handledKeys.includes(e.key.toLowerCase());
}
