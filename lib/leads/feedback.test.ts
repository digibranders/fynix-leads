import { describe, expect, it } from "vitest";
import { clarificationNote } from "./feedback";

describe("clarificationNote", () => {
  it("asks for a reply when the client wrote last", () => {
    expect(clarificationNote("client")).toBe("Waiting on your reply");
  });
  it("says the agency replied when Fynix wrote last", () => {
    expect(clarificationNote("fynix")).toBe("You replied");
  });
  it("says nothing when nobody has written, so it never claims a reply that was not sent", () => {
    expect(clarificationNote(null)).toBeNull();
  });
});
