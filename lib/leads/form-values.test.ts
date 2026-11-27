import { describe, expect, it } from "vitest";
import { restoreTextValues, textValues } from "./form-values";

const field = (name: string, type: string, value: string, tagName = "INPUT") => ({ name, type, value, tagName });

describe("keeping what was typed", () => {
  it("reads text, email, url, tel and textarea fields by name, and leaves hidden and button fields out", () => {
    const form = { elements: [field("prospectName", "text", "Marta"), field("prospectEmail", "email", "m@x.example"), field("notes", "textarea", "Called twice", "TEXTAREA"), field("draftId", "hidden", "d1"), field("go", "submit", "Send", "BUTTON"), field("", "text", "no name")] };
    expect(textValues(form)).toEqual({ prospectName: "Marta", prospectEmail: "m@x.example", notes: "Called twice" });
  });

  it("puts text back into the fields of the same names, and touches nothing else", () => {
    const name = field("prospectName", "text", "");
    const hidden = field("draftId", "hidden", "d1");
    const notes = field("notes", "textarea", "", "TEXTAREA");
    restoreTextValues({ elements: [name, hidden, notes] }, { prospectName: "Marta", draftId: "changed", notes: "Called twice", other: "x" });
    expect([name.value, hidden.value, notes.value]).toEqual(["Marta", "d1", "Called twice"]);
  });
});
