"use client";
import { useEffect } from "react";

type Handlers = { approve: () => void; reject: () => void; clarify: () => void; next: () => void; previous: () => void };

const KEYS: Record<string, keyof Handlers> = { a: "approve", r: "reject", c: "clarify", j: "next", k: "previous" };

/** Single-key triage shortcuts. Ignored while typing or while a dialog is open. */
export function useReviewKeys(handlers: Handlers, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      // A held key must not approve the whole queue.
      if (e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      const action = KEYS[e.key.toLowerCase()];
      if (!action) return;
      e.preventDefault();
      handlers[action]();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers, enabled]);
}
