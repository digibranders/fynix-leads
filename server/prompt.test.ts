import { describe, expect, it } from "vitest";
import { editLine } from "./prompt";

describe("editLine", () => {
  it("collects keystrokes and finishes on Enter, keeping what was typed before it", () => {
    expect(editLine("", "abc")).toEqual({ value: "abc", done: false, cancelled: false });
    expect(editLine("abc", "d\r")).toEqual({ value: "abcd", done: true, cancelled: false });
    expect(editLine("", "pasted-text\n")).toEqual({ value: "pasted-text", done: true, cancelled: false });
  });

  it("deletes the last character on backspace, and does nothing on an empty line", () => {
    expect(editLine("abc", String.fromCharCode(127)).value).toBe("ab");
    expect(editLine("", String.fromCharCode(127)).value).toBe("");
    expect(editLine("ab", "\b\bx").value).toBe("x");
  });

  it("cancels on Ctrl+C and drops what was typed, and ends the line on Ctrl+D", () => {
    expect(editLine("secret", String.fromCharCode(3))).toEqual({ value: "", done: false, cancelled: true });
    expect(editLine("secret", String.fromCharCode(4))).toEqual({ value: "secret", done: true, cancelled: false });
  });
});
