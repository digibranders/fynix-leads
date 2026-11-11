import { shouldHandleKey } from "@/lib/review/review-keys";

export type ReviewAction = "approve" | "reject" | "clarify" | "next" | "previous";

const KEYS: Record<string, ReviewAction> = { a: "approve", r: "reject", c: "clarify", j: "next", k: "previous" };

/**
 * Runs the shortcut for a keydown on a workspace element. Call it from that element's onKeyDown, never from a
 * window listener, so a single-character shortcut only fires while focus is inside it (WCAG 2.1.4). Only the
 * actions given are registered: a key the page does not handle is left alone, with no preventDefault.
 */
export function handleReviewKey(
  e: React.KeyboardEvent<HTMLElement>,
  handlers: Partial<Record<ReviewAction, () => void>>,
  enabled: boolean,
): void {
  if (!enabled) return;
  const handled = Object.keys(KEYS).filter((key) => handlers[KEYS[key]]);
  const target = e.target instanceof Element ? e.target : null;
  if (!shouldHandleKey({ key: e.key, repeat: e.repeat, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, target }, handled)) return;
  e.preventDefault();
  handlers[KEYS[e.key.toLowerCase()]]?.();
}
