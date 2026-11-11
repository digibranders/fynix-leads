import { describe, expect, it } from "vitest";
import { shouldHandleKey, type KeyEventLike } from "./review-keys";

const AR = ["a", "r"] as const;
const plain = (key: string, extra: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key,
  repeat: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  target: null,
  ...extra,
});
const inside = (selectors: string[]) => ({ closest: (s: string) => (selectors.some((x) => s.includes(x)) ? {} : null) });

describe("shouldHandleKey", () => {
  it("handles a registered key in either case", () => {
    expect(shouldHandleKey(plain("a"), AR)).toBe(true);
    expect(shouldHandleKey(plain("A"), AR)).toBe(true);
  });

  it("ignores keys the page does not register", () => {
    expect(shouldHandleKey(plain("j"), AR)).toBe(false);
    expect(shouldHandleKey(plain("c"), AR)).toBe(false);
    expect(shouldHandleKey(plain("Enter"), AR)).toBe(false);
  });

  it("ignores held keys", () => {
    expect(shouldHandleKey(plain("a", { repeat: true }), AR)).toBe(false);
  });

  it("ignores modifier combinations", () => {
    expect(shouldHandleKey(plain("r", { metaKey: true }), AR)).toBe(false);
    expect(shouldHandleKey(plain("r", { ctrlKey: true }), AR)).toBe(false);
    expect(shouldHandleKey(plain("a", { altKey: true }), AR)).toBe(false);
  });

  it("ignores typing targets and open dialogs", () => {
    for (const s of ["input", "textarea", "select", "contenteditable", "role=dialog"]) {
      expect(shouldHandleKey(plain("a", { target: inside([s]) }), AR)).toBe(false);
    }
  });

  it("handles a key whose target is not inside an editable control", () => {
    expect(shouldHandleKey(plain("a", { target: inside([]) }), AR)).toBe(true);
  });
});
